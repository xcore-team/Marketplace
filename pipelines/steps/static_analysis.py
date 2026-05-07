"""Gate 2 — Analyse statique (ASTScanner + Semgrep + Entropie + Taint)."""

from __future__ import annotations

import ast as _ast
import json
import logging
import math
import re
import time
from pathlib import Path

from ..common import _run, _xcore_manifest
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

_HIGH_ENTROPY_RE = re.compile(r'["\']([A-Za-z0-9+/=_\-]{20,})["\']')


def _shannon(s: str) -> float:
    if not s:
        return 0.0
    freq: dict[str, int] = {}
    for c in s:
        freq[c] = freq.get(c, 0) + 1
    return -sum((f / len(s)) * math.log2(f / len(s)) for f in freq.values())


class TaintScanner(_ast.NodeVisitor):
    """Analyseur de flux de données (Taint Analysis) simplifié."""

    SOURCES = {"os.getenv", "sys.argv", "input", "os.environ.get"}
    SINKS = {"os.system", "subprocess.run", "subprocess.call", "eval", "exec"}

    def __init__(self, rel_path: str):
        self.rel_path = rel_path
        self.tainted_vars: set[str] = set()
        self.findings: list[Finding] = []

    def visit_Assign(self, node: _ast.Assign):
        # On traque si la source est assignée à une variable
        if isinstance(node.value, _ast.Call):
            call_name = self._get_call_name(node.value)
            if call_name in self.SOURCES:
                for target in node.targets:
                    if isinstance(target, _ast.Name):
                        self.tainted_vars.add(target.id)
        self.generic_visit(node)

    def visit_Call(self, node: _ast.Call):
        call_name = self._get_call_name(node)
        if call_name in self.SINKS:
            # Vérifier si l'un des arguments est une variable 'tainted'
            for arg in node.args:
                if isinstance(arg, _ast.Name) and arg.id in self.tainted_vars:
                    self.findings.append(
                        Finding(
                            message=f"[TAINT] Donnée non fiable de {self.SOURCES} utilisée dans {call_name}",
                            severity=Severity.CRITICAL,
                            file=self.rel_path,
                            line=node.lineno,
                            code=f"Variable: {arg.id}",
                            remediation="Please use safer alternatives or fix the specific vulnerability.",
                        )
                    )
        self.generic_visit(node)

    def _get_call_name(self, node: _ast.Call) -> str:
        if isinstance(node.func, _ast.Name):
            return node.func.id
        if isinstance(node.func, _ast.Attribute):
            if isinstance(node.func.value, _ast.Name):
                return f"{node.func.value.id}.{node.func.attr}"
        return ""


async def gate_2(source_dir: Path) -> GateResult:
    started = time.time()
    findings: list[Finding] = []
    score = 0

    # 1. Semgrep
    rc, stdout, _ = _run(
        ["semgrep", "scan", "--config", "p/python", "--json", str(source_dir)],
        timeout=120,
    )
    if rc == 0 and stdout:
        try:
            for result in json.loads(stdout).get("results", []):
                s_sev = result.get("extra", {}).get("severity", "ERROR")
                sev = Severity.HIGH if s_sev == "ERROR" else Severity.MEDIUM
                findings.append(
                    Finding(
                        f"[SEMGREP] {result.get('extra', {}).get('message')}",
                        sev,
                        result.get("path"),
                        result.get("start", {}).get("line"),
                        remediation="Please use safer alternatives or fix the specific vulnerability.",
                    )
                )
                score += SCORE_MAP[sev]
        except Exception:
            pass

    # 2. Taint Analysis & AST Fallback
    for py in source_dir.rglob("*.py"):
        try:
            rel_path = str(py.relative_to(source_dir))
            tree = _ast.parse(py.read_text(encoding="utf-8", errors="ignore"))

            # Taint Analysis
            scanner = TaintScanner(rel_path)
            scanner.visit(tree)
            for f in scanner.findings:
                findings.append(f)
                score += SCORE_MAP[f.severity]

            # AST Fallback Builtins
            _FORBIDDEN = {"exec", "eval", "compile", "__import__"}
            for node in _ast.walk(tree):
                if isinstance(node, _ast.Call):
                    n = ""
                    if isinstance(node.func, _ast.Name):
                        n = node.func.id
                    elif isinstance(node.func, _ast.Attribute):
                        n = node.func.attr
                    if n in _FORBIDDEN:
                        findings.append(
                            Finding(
                                f"[AST] Usage de '{n}' interdit",
                                Severity.HIGH,
                                rel_path,
                                node.lineno,
                                remediation="Please use safer alternatives or fix the specific vulnerability.",
                            )
                        )
                        score += SCORE_MAP[Severity.HIGH]
        except Exception:
            pass

    # 3. Entropie
    for py in source_dir.rglob("*.py"):
        try:
            content = py.read_text(encoding="utf-8", errors="ignore")
            for m in _HIGH_ENTROPY_RE.finditer(content):
                cand = m.group(1)
                if _shannon(cand) > 4.5:
                    findings.append(
                        Finding(
                            "Haute entropie détectée",
                            Severity.MEDIUM,
                            str(py.relative_to(source_dir)),
                            code=cand[:20] + "...",
                            remediation="Please use safer alternatives or fix the specific vulnerability.",
                        )
                    )
                    score += SCORE_MAP[Severity.MEDIUM]
        except Exception:
            pass

    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )
    return make_result("gate_2_static", status, score, findings, started)
