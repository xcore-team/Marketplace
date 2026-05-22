"""Gate 5 (Service) — Validation structurelle et comportementale des extensions de service.

Diffère du gate_5 plugin :
- Lit service.yaml au lieu de plugin.yaml
- Résout entry_class (module.path:ClassName) pour trouver le fichier source
- Exige init(), shutdown(), health_check() — interface BaseService
- Autorise les imports réseau (ssl, socket, urllib) : INFO seulement
- Bloque subprocess, pty, ctypes, cffi comme le gate plugin
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

from ..models import (
    SCORE_AUTO_REJECT,
    SCORE_MAP,
    Finding,
    GateResult,
    GateStatus,
    Severity,
    make_result,
)

logger = logging.getLogger("hub.xservices.gates")

# Modules réseau légitimes pour un service — signalés INFO, pas pénalisés
_NETWORK_MODULES = {"ssl", "socket", "urllib", "http", "httpx", "aiohttp", "requests", "smtplib", "ftplib"}

# Modules réellement dangereux — bloquants même pour un service
_DANGEROUS_IMPORTS: dict[str, tuple[Severity, str]] = {
    "subprocess": (Severity.CRITICAL, "exécution de sous-processus"),
    "pty":        (Severity.HIGH,     "pseudo-terminal (risque d'élévation)"),
    "ctypes":     (Severity.HIGH,     "appels natifs C/DLL"),
    "cffi":       (Severity.MEDIUM,   "appels natifs C (cffi)"),
}

_SERVICE_REQUIRED_METHODS = {"init", "shutdown", "health_check"}


def _entry_class_to_path(source_dir: Path, entry_class: str) -> tuple[Path | None, str]:
    """Convertit 'module.path:ClassName' en chemin de fichier .py dans source_dir."""
    module_part = entry_class.split(":")[0]
    rel_path = module_part.replace(".", "/") + ".py"
    candidate = source_dir / rel_path
    return (candidate if candidate.exists() else None), rel_path


async def gate_5_service(source_dir: Path, timeout: int = 30) -> GateResult:
    """
    Gate 5 (Service) — valide la structure et le comportement d'une extension de service.
    """
    import ast as _ast

    try:
        import yaml
    except ImportError:
        import tomllib as yaml  # fallback minimal — yaml should always be present

    started = time.time()
    findings: list[Finding] = []
    score = 0

    # ── 1. Lire service.yaml ──────────────────────────────────────────────────
    service_yaml_path = source_dir / "service.yaml"
    if not service_yaml_path.exists():
        findings.append(
            Finding(
                "service.yaml introuvable à la racine de l'archive",
                Severity.HIGH,
                remediation=(
                    "Ajoutez un fichier service.yaml à la racine.\n"
                    "Exemple minimal :\n"
                    "  name: mon-service\n"
                    "  version: 1.0.0\n"
                    "  entry_class: mon_service.main:MonService"
                ),
            )
        )
        return make_result(
            "gate_5_sandbox", GateStatus.BLOCKED, SCORE_MAP[Severity.HIGH], findings, started
        )

    try:
        data = yaml.safe_load(service_yaml_path.read_text(encoding="utf-8"))
    except Exception as e:
        findings.append(Finding(f"service.yaml illisible : {e}", Severity.HIGH))
        return make_result(
            "gate_5_sandbox", GateStatus.BLOCKED, SCORE_MAP[Severity.HIGH], findings, started
        )

    service_name = data.get("name", "?")
    entry_class: str = data.get("entry_class") or data.get("module", "")

    if not entry_class:
        findings.append(
            Finding(
                "Champ `entry_class` manquant dans service.yaml",
                Severity.HIGH,
                remediation=(
                    "Ajoutez `entry_class: votre.module:VotreClasse` dans service.yaml.\n"
                    "La classe doit hériter de BaseService et implémenter "
                    "`init()`, `shutdown()` et `health_check()`."
                ),
            )
        )
        return make_result(
            "gate_5_sandbox", GateStatus.BLOCKED, SCORE_MAP[Severity.HIGH], findings, started
        )

    # ── 2. Localiser le fichier source ────────────────────────────────────────
    entry_path, rel_path = _entry_class_to_path(source_dir, entry_class)
    class_name = entry_class.split(":")[-1] if ":" in entry_class else None

    if entry_path is None:
        findings.append(
            Finding(
                f"Fichier source introuvable pour `{entry_class}`",
                Severity.HIGH,
                remediation=(
                    f"Le champ `entry_class` pointe vers `{rel_path}` "
                    "qui n'existe pas dans l'archive. "
                    "Vérifiez que le module est bien inclus et que le chemin est correct."
                ),
            )
        )
        score += SCORE_MAP[Severity.HIGH]
    else:
        # ── 3. Validation structurelle via AST ────────────────────────────────
        rel = str(entry_path.relative_to(source_dir))

        try:
            source = entry_path.read_text(encoding="utf-8", errors="ignore")
            tree = _ast.parse(source, filename=rel)
        except SyntaxError as e:
            findings.append(
                Finding(
                    f"Erreur de syntaxe dans `{rel}` (ligne {e.lineno}) : {e.msg}",
                    Severity.HIGH,
                    file=rel,
                    line=e.lineno,
                    remediation="Corrigez l'erreur de syntaxe avant de soumettre.",
                )
            )
            return make_result(
                "gate_5_sandbox", GateStatus.BLOCKED, SCORE_MAP[Severity.HIGH], findings, started
            )

        target_class_node = None
        if class_name:
            for node in _ast.walk(tree):
                if isinstance(node, _ast.ClassDef) and node.name == class_name:
                    target_class_node = node
                    break

        if class_name and target_class_node is None:
            findings.append(
                Finding(
                    f"Classe `{class_name}` introuvable dans `{rel}`",
                    Severity.HIGH,
                    file=rel,
                    remediation=(
                        f"Définissez `class {class_name}(BaseService)` dans `{rel}` "
                        "avec les méthodes `init()`, `shutdown()` et `health_check()`."
                    ),
                )
            )
            score += SCORE_MAP[Severity.HIGH]
        elif target_class_node is not None:
            method_names = {
                n.name
                for n in _ast.walk(target_class_node)
                if isinstance(n, (_ast.FunctionDef, _ast.AsyncFunctionDef))
            }
            missing = _SERVICE_REQUIRED_METHODS - method_names
            if missing:
                findings.append(
                    Finding(
                        f"Méthodes requises manquantes dans `{class_name}` : {sorted(missing)}",
                        Severity.HIGH,
                        file=rel,
                        line=target_class_node.lineno,
                        code=f"Méthodes trouvées : {sorted(method_names) or '[]'}",
                        remediation=(
                            "Implémentez les méthodes requises par BaseService :\n"
                            "  async def init(self) -> None: ...\n"
                            "  async def shutdown(self) -> None: ...\n"
                            "  async def health_check(self) -> dict: ..."
                        ),
                    )
                )
                score += SCORE_MAP[Severity.HIGH]
            else:
                logger.info("[gate_5_service] Classe `%s` OK — méthodes : %s", class_name, method_names)

    # ── 4. Scan comportemental AST — tout le code source ─────────────────────
    dangerous_found: dict[str, list[tuple[str, int, str]]] = {}
    network_found: dict[str, list[tuple[str, int, str]]] = {}

    for py in source_dir.rglob("*.py"):
        rel_py = str(py.relative_to(source_dir))
        try:
            content = py.read_text(encoding="utf-8", errors="ignore")
            py_lines = content.splitlines()
            py_tree = _ast.parse(content)
            for node in _ast.walk(py_tree):
                if not isinstance(node, (_ast.Import, _ast.ImportFrom)):
                    continue
                if isinstance(node, _ast.Import):
                    names = [a.name.split(".")[0] for a in node.names]
                else:
                    names = [node.module.split(".")[0]] if node.module else []
                line_src = (
                    py_lines[node.lineno - 1].strip()
                    if 0 < node.lineno <= len(py_lines)
                    else ""
                )
                for n in names:
                    if n in _DANGEROUS_IMPORTS:
                        dangerous_found.setdefault(n, []).append((rel_py, node.lineno, line_src))
                    elif n in _NETWORK_MODULES:
                        network_found.setdefault(n, []).append((rel_py, node.lineno, line_src))
        except Exception:
            pass

    # Modules dangereux → pénalisés
    for mod, occurrences in dangerous_found.items():
        sev, desc = _DANGEROUS_IMPORTS[mod]
        sample = "\n".join(f"  {r}:{ln}  {src}" for r, ln, src in occurrences[:4])
        findings.append(
            Finding(
                f"Import de `{mod}` ({desc}) — {len(occurrences)} occurrence(s)",
                sev,
                code=sample,
                remediation=(
                    f"Le module `{mod}` permet {desc}. "
                    "Supprimez cet import si non nécessaire, ou justifiez son usage "
                    "dans la documentation de votre service."
                ),
            )
        )
        score += SCORE_MAP[sev]

    # Modules réseau → INFO uniquement, pas de pénalité
    for mod, occurrences in network_found.items():
        sample = "\n".join(f"  {r}:{ln}  {src}" for r, ln, src in occurrences[:3])
        findings.append(
            Finding(
                f"Import réseau `{mod}` — {len(occurrences)} occurrence(s) (normal pour un service)",
                Severity.INFO,
                code=sample,
                remediation=(
                    f"`{mod}` est un module réseau standard. "
                    "Son utilisation est attendue dans une extension de service — aucune action requise."
                ),
            )
        )

    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )
    logger.info("[gate_5_service] '%s' → %s (score=%d)", service_name, status.value, score)
    return make_result("gate_5_sandbox", status, score, findings, started)
