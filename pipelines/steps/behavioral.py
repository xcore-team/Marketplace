"""Gate 6 — Behavioral (diff permissions déclarées vs imports AST)."""

from __future__ import annotations

import ast as _ast
import logging
import time
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

_NET_MOD = {
    "socket",
    "ssl",
    "http",
    "urllib",
    "httpx",
    "requests",
    "aiohttp",
    "websockets",
}
_PROC_MOD = {"subprocess", "pty", "ctypes", "cffi"}
_FS_MOD = {"shutil", "tempfile"}


async def gate_6(source_dir: Path) -> GateResult:
    started = time.time()
    findings: list[Finding] = []
    score = 0

    manifest = _xcore_manifest(source_dir)
    decl_net = False
    decl_proc = False
    if manifest:
        for perm in getattr(manifest, "permissions", []) or []:
            r = perm.get("resource", "") if isinstance(perm, dict) else str(perm)
            if "network" in r:
                decl_net = True
            if "subprocess" in r or "process" in r:
                decl_proc = True

    det_net: set[str] = set()
    det_proc: set[str] = set()
    det_fs: set[str] = set()
    for py in source_dir.rglob("*.py"):
        try:
            tree = _ast.parse(py.read_text(encoding="utf-8", errors="ignore"))
            for node in _ast.walk(tree):
                if not isinstance(node, (_ast.Import, _ast.ImportFrom)):
                    continue
                names = (
                    [a.name.split(".")[0] for a in node.names]
                    if isinstance(node, _ast.Import)
                    else ([node.module.split(".")[0]] if node.module else [])
                )
                for n in names:
                    if n in _NET_MOD:
                        det_net.add(n)
                    if n in _PROC_MOD:
                        det_proc.add(n)
                    if n in _FS_MOD:
                        det_fs.add(n)
        except Exception:
            pass

    if det_net and not decl_net:
        findings.append(
            Finding(
                f"[BEHAVIORAL] Accès réseau non déclaré (imports: {det_net})",
                Severity.HIGH,
            )
        )
        score += SCORE_MAP[Severity.HIGH]
    if det_proc and not decl_proc:
        findings.append(
            Finding(
                f"[BEHAVIORAL] Processus non déclaré (imports: {det_proc})",
                Severity.HIGH,
            )
        )
        score += SCORE_MAP[Severity.HIGH]
    if det_fs:
        findings.append(
            Finding(
                f"[BEHAVIORAL] Filesystem write non déclaré (imports: {det_fs})",
                Severity.MEDIUM,
            )
        )
        score += SCORE_MAP[Severity.MEDIUM]

    if score == 0:
        logger.info("[gate_6] Comportement conforme aux permissions déclarées")
    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )
    return make_result("gate_6_behavioral", status, score, findings, started)
