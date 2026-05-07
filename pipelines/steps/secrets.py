"""Gate 4 — Secrets (detect-secrets + Gitleaks-style patterns)."""

from __future__ import annotations

import json
import logging
import re
import time
from pathlib import Path

from ..common import _run
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

# Patterns inspirés de Gitleaks pour une détection plus profonde
_SECRET_PATTERNS = {
    "Slack Token": re.compile(
        r"(xox[p|b|o|a]-[0-9]{12}-[0-9]{12}-[0-9]{12}-[a-z0-9]{32})"
    ),
    "RSA Private Key": re.compile(r"-----BEGIN RSA PRIVATE KEY-----"),
    "SSH Private Key": re.compile(r"-----BEGIN [A-Z ]+ PRIVATE KEY-----"),
    "Google API Key": re.compile(r"AIza[0-9A-Za-z\\-_]{35}"),
    "AWS Access Key ID": re.compile(
        r"(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}"
    ),
    "AWS Secret Access Key": re.compile(
        r"(?i)aws_(?:secret|key|access|token).{0,20}[:=]\s*['\"]([A-Za-z0-9/+=]{40})['\"]"
    ),
    "GitHub Personal Access Token": re.compile(r"gh[pousr]_[A-Za-z0-9]{36,}"),
    "Stripe API Key": re.compile(r"(?:sk|pk)_(?:test|live)_[0-9a-zA-Z]{24}"),
    "Heroku API Key": re.compile(
        r"[h|H][e|E][r|R][o|O][k|K][u|U].*[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}"
    ),
    "Twilio Account SID": re.compile(r"AC[a-z0-9]{32}"),
    "JWT": re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"),
    "Generic Secret": re.compile(
        r'(?i)(api[_\-]?key|secret|password|passwd|token|auth)\s*[:=]\s*["\']([^"\']{10,})["\']'
    ),
}

_SCAN_EXT = {".py", ".env", ".yaml", ".yml", ".json", ".txt", ".toml", ".md", ".sh"}


async def gate_4(source_dir: Path) -> GateResult:
    started = time.time()
    findings: list[Finding] = []
    score = 0
    flagged_locations: set[str] = set()  # "file:line"

    # 1. detect-secrets (Outil de base)
    rc, stdout, _ = _run(["detect-secrets", "scan", str(source_dir)])
    if rc == 0 and stdout:
        try:
            for filepath, secrets in json.loads(stdout).get("results", {}).items():
                for s in secrets:
                    rel_path = str(Path(filepath).relative_to(source_dir))
                    line = s.get("line_number")
                    findings.append(
                        Finding(
                            message=f"[SECRET] {s.get('type', 'Secret')} détecté par analyse de base",
                            severity=Severity.HIGH,
                            file=rel_path,
                            line=line,
                            remediation="Remove the secret from the source code, rotate it immediately, and use environment variables or a secret manager.",
                        )
                    )
                    flagged_locations.add(f"{rel_path}:{line}")
                    score += SCORE_MAP[Severity.HIGH]
        except Exception:
            pass
    else:
        findings.append(
            Finding(
                "detect-secrets indisponible — Usage des patterns custom uniquement",
                Severity.INFO,
            )
        )

    # 2. Deep Scanning avec patterns Gitleaks-style
    for f in source_dir.rglob("*"):
        if not f.is_file() or f.suffix not in _SCAN_EXT:
            continue

        rel_path = str(f.relative_to(source_dir))
        try:
            lines = f.read_text(encoding="utf-8", errors="ignore").splitlines()
            for line_idx, content in enumerate(lines, 1):
                for name, pattern in _SECRET_PATTERNS.items():
                    if pattern.search(content):
                        if f"{rel_path}:{line_idx}" not in flagged_locations:
                            findings.append(
                                Finding(
                                    message=f"[DEEP SECRET] {name} potentiel détecté",
                                    severity=Severity.CRITICAL
                                    if "Private Key" in name
                                    else Severity.HIGH,
                                    file=rel_path,
                                    line=line_idx,
                                    code=content.strip()[:50] + "...",
                                    remediation="Remove this potential secret immediately, rotate it, and ensure it is not committed to version control.",
                                )
                            )
                            flagged_locations.add(f"{rel_path}:{line_idx}")
                            score += SCORE_MAP[
                                Severity.CRITICAL
                                if "Private Key" in name
                                else Severity.HIGH
                            ]
        except Exception as e:
            logger.error(f"Erreur scan secrets sur {rel_path}: {e}")

    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )
    return make_result("gate_4_secrets", status, score, findings, started)
