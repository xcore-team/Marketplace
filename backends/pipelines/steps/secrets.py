"""Gate 4 — Secrets (detect-secrets + patterns Gitleaks-style)."""

from __future__ import annotations

import json
import logging
import re
import time
from pathlib import Path

from ..common import _run, tool_path
from ..models import (
    SCORE_AUTO_REJECT,
    SCORE_MAP,
    Finding,
    GateResult,
    GateStatus,
    Severity,
    make_result,
)

logger = logging.getLogger("hub.marketplace.gates")

_SECRET_PATTERNS: dict[str, tuple[re.Pattern, Severity]] = {
    "Clé privée RSA":        (re.compile(r"-----BEGIN RSA PRIVATE KEY-----"), Severity.CRITICAL),
    "Clé privée SSH":        (re.compile(r"-----BEGIN [A-Z ]+ PRIVATE KEY-----"), Severity.CRITICAL),
    "Slack Token":           (re.compile(r"xox[p|b|o|a]-[0-9]{12}-[0-9]{12}-[0-9]{12}-[a-z0-9]{32}"), Severity.HIGH),
    "Google API Key":        (re.compile(r"AIza[0-9A-Za-z\-_]{35}"), Severity.HIGH),
    "AWS Access Key ID":     (re.compile(r"(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}"), Severity.HIGH),
    "AWS Secret Access Key": (re.compile(r"(?i)aws_(?:secret|key|access|token).{0,20}[:=]\s*['\"]([A-Za-z0-9/+=]{40})['\"]"), Severity.CRITICAL),
    "GitHub PAT":            (re.compile(r"gh[pousr]_[A-Za-z0-9]{36,}"), Severity.HIGH),
    "Stripe API Key":        (re.compile(r"(?:sk|pk)_(?:test|live)_[0-9a-zA-Z]{24}"), Severity.HIGH),
    "Heroku API Key":        (re.compile(r"[hH][eE][rR][oO][kK][uU].{0,20}[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}"), Severity.HIGH),
    "JWT Token":             (re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"), Severity.HIGH),
    "Secret générique":      (re.compile(r'(?i)(api[_\-]?key|secret|password|passwd|token|auth)\s*[:=]\s*["\']([^"\']{10,})["\']'), Severity.HIGH),
}

# Valeurs qui ressemblent à des références de variables — jamais des vrais secrets.
_PLACEHOLDER_RE = re.compile(
    r'^\s*(?:'
    r'\$\{[A-Za-z_][A-Za-z0-9_]*(?::-[^}]*)?\}'  # ${VAR} ou ${VAR:-default}
    r'|\$[A-Za-z_][A-Za-z0-9_]+'                   # $VAR
    r'|%\([A-Za-z_][A-Za-z0-9_]*\)s'               # %(VAR)s (Python format)
    r'|\{\{[A-Za-z_][A-Za-z0-9_ ]*\}\}'            # {{VAR}} (Jinja/Ansible)
    r'|<[A-Za-z_][A-Za-z0-9_ \-]{0,50}>'           # <placeholder>
    r'|(?:your[-_]|changeme|placeholder|replace[-_]?me|todo|insert[-_]here|example).*'
    r'|(?:xxx+|yyy+|zzz+)'
    r')\s*$',
    re.IGNORECASE,
)


def _is_placeholder(value: str) -> bool:
    """Renvoie True si la valeur ressemble à un placeholder/référence de variable."""
    return bool(_PLACEHOLDER_RE.match(value))

_SCAN_EXT = {".py", ".env", ".yaml", ".yml", ".json", ".txt", ".toml", ".md", ".sh", ".cfg", ".ini"}

def _redact(value: str) -> str:
    """Masque partiellement une valeur sensible pour le rapport."""
    if len(value) <= 8:
        return "***"
    return value[:4] + "…" + value[-4:]


async def gate_4(source_dir: Path) -> GateResult:
    started = time.time()
    findings: list[Finding] = []
    score = 0
    flagged: set[str] = set()  # "file:line" déjà signalé

    # 1. detect-secrets
    rc, stdout, _ = _run([tool_path("detect-secrets"), "scan", str(source_dir)], timeout=60)
    if rc == 0 and stdout.strip():
        try:
            ds_data = json.loads(stdout)
            for filepath, secrets in ds_data.get("results", {}).items():
                try:
                    rel = str(Path(filepath).relative_to(source_dir))
                except ValueError:
                    rel = filepath
                for s in secrets:
                    lineno = s.get("line_number")
                    secret_type = s.get("type", "Secret")
                    key = f"{rel}:{lineno}"
                    flagged.add(key)
                    findings.append(
                        Finding(
                            message=f"Secret détecté par detect-secrets : {secret_type}",
                            severity=Severity.HIGH,
                            file=rel,
                            line=lineno,
                            remediation=(
                                f"Supprimez ce {secret_type} du code source. "
                                "Faites tourner/révoquer la clé immédiatement si elle a été commitée. "
                                "Utilisez des variables d'environnement ou un gestionnaire de secrets."
                            ),
                        )
                    )
                    score += SCORE_MAP[Severity.HIGH]
        except Exception as e:
            logger.warning(f"[gate_4] Parse detect-secrets échoué : {e}")
    else:
        findings.append(
            Finding(
                "detect-secrets indisponible — analyse approfondie des patterns uniquement",
                Severity.INFO,
                remediation="Installez detect-secrets : `pip install detect-secrets`",
            )
        )

    # 2. Patterns custom (Gitleaks-style) sur tous les fichiers texte
    for f in source_dir.rglob("*"):
        if not f.is_file() or f.suffix not in _SCAN_EXT:
            continue
        rel = str(f.relative_to(source_dir))
        try:
            lines = f.read_text(encoding="utf-8", errors="ignore").splitlines()
            for lineno, line in enumerate(lines, 1):
                key = f"{rel}:{lineno}"
                if key in flagged:
                    continue
                for pattern_name, (pattern, sev) in _SECRET_PATTERNS.items():
                    m = pattern.search(line)
                    if not m:
                        continue

                    # La valeur sensible est le dernier groupe capturant (ou le match complet).
                    # Pour "Secret générique" (2 groupes) : groupe 2 = valeur entre guillemets.
                    actual_value = m.group(m.lastindex) if m.lastindex else m.group(0)

                    # Ignore les références de variables — ce ne sont pas de vrais secrets.
                    if _is_placeholder(actual_value):
                        continue

                    flagged.add(key)

                    matched_val = actual_value
                    redacted = _redact(matched_val)

                    # Ligne masquée pour le rapport
                    code_line = line.strip()
                    if len(code_line) > 100:
                        code_line = code_line[:97] + "…"

                    findings.append(
                        Finding(
                            message=f"Pattern `{pattern_name}` détecté",
                            severity=sev,
                            file=rel,
                            line=lineno,
                            code=f"Valeur (masquée) : {redacted}  |  {code_line}",
                            remediation=(
                                f"Supprimez ce {pattern_name} du fichier `{rel}` ligne {lineno}. "
                                "Révoquez et régénérez cette clé/token immédiatement s'il a été exposé. "
                                "Stockez les secrets dans des variables d'environnement ou Vault."
                            ),
                        )
                    )
                    score += SCORE_MAP[sev]
                    break  # un seul finding par ligne

        except Exception as e:
            logger.debug(f"[gate_4] Erreur scan {rel}: {e}")

    logger.info(f"[gate_4] {len(findings)} finding(s), score={score}")
    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )
    return make_result("gate_4_secrets", status, score, findings, started)
