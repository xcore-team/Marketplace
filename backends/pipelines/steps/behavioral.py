"""Gate 6 — Behavioral (diff permissions déclarées vs imports AST, par fichier)."""

from __future__ import annotations

import ast as _ast
import logging
import time
from collections import defaultdict
from pathlib import Path

from ..common import _xcore_manifest
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

_NET_MOD = {"socket", "ssl", "http", "urllib", "httpx", "requests", "aiohttp", "websockets"}
_PROC_MOD = {"subprocess", "pty", "ctypes", "cffi"}
_FS_MOD = {"shutil", "tempfile"}

# Description lisible de chaque module
_MOD_DESC = {
    "socket": "connexions TCP/UDP directes",
    "ssl": "connexions TLS/SSL",
    "http": "requêtes HTTP",
    "urllib": "requêtes HTTP (urllib)",
    "httpx": "requêtes HTTP (httpx)",
    "requests": "requêtes HTTP (requests)",
    "aiohttp": "requêtes HTTP async (aiohttp)",
    "websockets": "connexions WebSocket",
    "subprocess": "exécution de sous-processus",
    "pty": "pseudo-terminal (risque élévation)",
    "ctypes": "appels natifs C/DLL (risque élevé)",
    "cffi": "appels natifs C (cffi)",
    "shutil": "opérations filesystem étendues",
    "tempfile": "création de fichiers temporaires",
}


async def gate_6(source_dir: Path) -> GateResult:
    started = time.time()
    findings: list[Finding] = []
    score = 0

    manifest = _xcore_manifest(source_dir)
    decl_net = False
    decl_proc = False
    allowed_imports: set[str] = set()

    if manifest:
        for perm in getattr(manifest, "permissions", []) or []:
            r = perm.get("resource", "") if isinstance(perm, dict) else str(perm)
            if "network" in r:
                decl_net = True
            if "subprocess" in r or "process" in r:
                decl_proc = True
        # allowed_imports déclare explicitement les modules autorisés
        for entry in getattr(manifest, "allowed_imports", []) or []:
            if isinstance(entry, str):
                allowed_imports.add(entry.split(".")[0].lower())

    # Scan AST — collecte par module ET par fichier
    # Structure : {module: [(rel_path, lineno, import_line), ...]}
    net_uses:  dict[str, list[tuple[str, int, str]]] = defaultdict(list)
    proc_uses: dict[str, list[tuple[str, int, str]]] = defaultdict(list)
    fs_uses:   dict[str, list[tuple[str, int, str]]] = defaultdict(list)

    for py in source_dir.rglob("*.py"):
        rel = str(py.relative_to(source_dir))
        try:
            lines = py.read_text(encoding="utf-8", errors="ignore").splitlines()
            tree = _ast.parse("\n".join(lines))
            for node in _ast.walk(tree):
                if not isinstance(node, (_ast.Import, _ast.ImportFrom)):
                    continue

                if isinstance(node, _ast.Import):
                    names = [a.name.split(".")[0] for a in node.names]
                else:
                    names = [node.module.split(".")[0]] if node.module else []

                line_src = lines[node.lineno - 1].strip() if 0 < node.lineno <= len(lines) else ""

                for n in names:
                    entry = (rel, node.lineno, line_src)
                    if n in _NET_MOD:
                        net_uses[n].append(entry)
                    if n in _PROC_MOD:
                        proc_uses[n].append(entry)
                    if n in _FS_MOD:
                        fs_uses[n].append(entry)
        except Exception:
            pass

    def _format_uses(uses: dict[str, list[tuple[str, int, str]]]) -> tuple[str, str]:
        """Retourne (résumé modules, détail fichiers) pour le rapport."""
        modules = list(uses.keys())
        lines = []
        for mod, occurrences in uses.items():
            desc = _MOD_DESC.get(mod, mod)
            for (rel, lineno, src) in occurrences[:3]:  # max 3 par module
                lines.append(f"  {rel}:{lineno}  import {mod}  ({desc})")
        return ", ".join(modules), "\n".join(lines)

    # Réseau non déclaré
    # Un module est couvert si : permissions.network OU présent dans allowed_imports
    undeclared_net = {
        mod: uses for mod, uses in net_uses.items()
        if not decl_net and mod.lower() not in allowed_imports
    }
    if undeclared_net:
        mods_str, detail = _format_uses(undeclared_net)
        findings.append(
            Finding(
                message=f"Accès réseau non déclaré dans les permissions (modules: {mods_str})",
                severity=Severity.HIGH,
                code=detail,
                remediation=(
                    f"Ajoutez dans plugin.yaml :\n"
                    f"  permissions:\n"
                    f"    - resource: network\n"
                    f"      description: \"Raison de l'accès réseau\"\n\n"
                    f"Ou déclarez les modules dans allowed_imports :\n"
                    f"  allowed_imports:\n"
                    + "".join(f"    - {m}\n" for m in undeclared_net) +
                    f"\nOu supprimez les imports réseau si non nécessaires : {mods_str}"
                ),
            )
        )
        score += SCORE_MAP[Severity.HIGH]

    # Processus non déclaré
    undeclared_proc = {
        mod: uses for mod, uses in proc_uses.items()
        if not decl_proc and mod.lower() not in allowed_imports
    }
    if undeclared_proc:
        mods_str, detail = _format_uses(undeclared_proc)
        findings.append(
            Finding(
                message=f"Exécution de sous-processus non déclarée (modules: {mods_str})",
                severity=Severity.HIGH,
                code=detail,
                remediation=(
                    f"Ajoutez dans plugin.yaml :\n"
                    f"  permissions:\n"
                    f"    - resource: subprocess\n"
                    f"      description: \"Raison de l'exécution subprocess\"\n\n"
                    f"Attention : `ctypes` et `pty` peuvent indiquer une tentative d'élévation de privilèges."
                ),
            )
        )
        score += SCORE_MAP[Severity.HIGH]

    # Filesystem étendu (avertissement, non bloquant)
    if fs_uses:
        mods_str, detail = _format_uses(fs_uses)
        findings.append(
            Finding(
                message=f"Opérations filesystem non standard détectées (modules: {mods_str})",
                severity=Severity.MEDIUM,
                code=detail,
                remediation=(
                    "Les opérations shutil/tempfile sont autorisées mais surveillées. "
                    "Assurez-vous de ne pas écrire en dehors du répertoire de données du plugin. "
                    "Évitez de créer des fichiers temporaires sans les supprimer (tempfile.mktemp est dangereux, "
                    "préférez tempfile.NamedTemporaryFile avec delete=True)."
                ),
            )
        )
        score += SCORE_MAP[Severity.MEDIUM]

    # Résumé
    if score == 0:
        logger.info("[gate_6] Comportement conforme aux permissions déclarées")
    else:
        decl = []
        if decl_net:
            decl.append("network")
        if decl_proc:
            decl.append("subprocess")
        logger.info(
            "[gate_6] Permissions déclarées : %s | allowed_imports : %s | score=%d",
            decl or "aucune", sorted(allowed_imports) or "aucun", score,
        )

    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )
    return make_result("gate_6_behavioral", status, score, findings, started)
