"""Gate 3 — Supply chain (pip-audit)."""

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

_URL_DEP_RE = re.compile(r"(https?://\S+|git\+\S+)")


async def gate_3(source_dir: Path) -> GateResult:
    started = time.time()
    findings: list[Finding] = []
    score = 0

    req = source_dir / "requirements.txt"
    pyp = source_dir / "pyproject.toml"

    if not req.exists() and not pyp.exists():
        findings.append(
            Finding(
                "Aucun lockfile trouvé — audit supply chain impossible", Severity.MEDIUM
            )
        )
        score += SCORE_MAP[Severity.MEDIUM]
        return make_result(
            "gate_3_supply_chain", GateStatus.FAILED, score, findings, started
        )

    target = str(req) if req.exists() else str(pyp)
    rc, stdout, stderr = _run(
        ["pip-audit", "--requirement", target, "--format", "json"], timeout=90
    )

    if rc == 0:
        logger.info("[gate_3] pip-audit : aucune vulnérabilité")
    elif rc == 1 and stdout:
        try:
            for vuln in json.loads(stdout).get("vulnerabilities", []):
                pkg, vers = vuln.get("name", "?"), vuln.get("version", "?")
                ids = [v.get("id", "?") for v in vuln.get("vulns", [])]
                has_fix = any(v.get("fix_versions") for v in vuln.get("vulns", []))

                sev = Severity.MEDIUM if has_fix else Severity.HIGH
                remediation = f"Upgrade {pkg} to a version that fixes {', '.join(ids)}." if has_fix else f"No automatic fix available for {pkg}. Consider using an alternative package."
                findings.append(
                    Finding(
                        f"[SUPPLY] {', '.join(ids)} dans {pkg}=={vers}",
                        sev,
                        file=target,
                        remediation=remediation,
                    )
                )
                score += SCORE_MAP[sev]
        except Exception:
            pass
    else:
        findings.append(
            Finding(f"[SUPPLY] pip-audit indisponible : {stderr[:80]}", Severity.INFO)
        )
        score += 2

    if req.exists():
        urls = _URL_DEP_RE.findall(req.read_text(errors="ignore"))
        if urls:
            findings.append(
                Finding(
                    f"[SUPPLY] URLs directes non vérifiables détectées",
                    Severity.MEDIUM,
                    code=str(urls[:3]),
                )
            )
            score += SCORE_MAP[Severity.MEDIUM]

    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )
    return make_result("gate_3_supply_chain", status, score, findings, started)
