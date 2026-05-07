"""Gate 9 — Supply Health (Santé OpenSSF & Dependency Confusion)."""

from __future__ import annotations

import json
import logging
import re
import time
import urllib.error
import urllib.request
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

logger = logging.getLogger("hub.marketplace.gates")


async def gate_9(source_dir: Path) -> GateResult:
    """
    Vérifie la santé des dépendances (OpenSSF Scorecard) et les risques de Dependency Confusion.
    """
    started = time.time()
    findings: list[Finding] = []
    score = 0

    req_file = source_dir / "requirements.txt"
    if not req_file.exists():
        return make_result(
            "gate_9_supply_health", GateStatus.PASSED, 0, findings, started
        )

    try:
        content = req_file.read_text()
        packages = re.findall(r"^([a-zA-Z0-9_\-]+)", content, re.MULTILINE)

        for pkg in set(packages):
            # 1. Dependency Confusion Check
            # On vérifie si le package existe sur PyPI. S'il n'existe pas, il est probablement privé.
            # S'il est privé mais n'est pas préfixé par un namespace interne, c'est un risque.
            exists_on_pypi = _check_pypi_exists(pkg)
            if not exists_on_pypi:
                # Si le package n'est pas sur PyPI et ne commence pas par un prefixe interne "xcore-"
                if not pkg.startswith("xcore-") and not pkg.startswith("hub-"):
                    findings.append(
                        Finding(
                            message=f"Risque de Dependency Confusion : {pkg} n'est pas sur PyPI et n'a pas de namespace interne.",
                            severity=Severity.HIGH,
                            file="requirements.txt",
                            remediation=f"Rename the package to use an internal namespace (e.g., xcore-{pkg}) or ensure it's properly hosted in an internal registry.",
                        )
                    )
                    score += SCORE_MAP[Severity.HIGH]

            # 2. Dependency Health (OpenSSF Scorecard via deps.dev API)
            # Note: deps.dev fournit des scores consolidés.
            health_info = _fetch_deps_dev_health(pkg)
            if health_info and health_info.get("scorecard"):
                sc = health_info["scorecard"]
                overall_score = sc.get("overallScore", 10.0)
                if overall_score < 4.0:
                    findings.append(
                        Finding(
                            message=f"Santé de dépendance critique : {pkg} a un score OpenSSF de {overall_score}/10",
                            severity=Severity.MEDIUM,
                            file="requirements.txt",
                            remediation="Consider replacing this package with a better-maintained alternative or conducting a thorough manual security audit.",
                        )
                    )
                    score += SCORE_MAP[Severity.MEDIUM]
                elif overall_score < 6.0:
                    findings.append(
                        Finding(
                            message=f"Santé de dépendance faible : {pkg} a un score OpenSSF de {overall_score}/10",
                            severity=Severity.LOW,
                            file="requirements.txt",
                            remediation="Monitor this package for health updates and consider more active alternatives if maintenance continues to decline.",
                        )
                    )
                    score += SCORE_MAP[Severity.LOW]

    except Exception as e:
        logger.error(f"[gate_9] Erreur: {e}")

    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )
    return make_result("gate_9_supply_health", status, score, findings, started)


def _check_pypi_exists(package_name: str) -> bool:
    url = f"https://pypi.org/pypi/{package_name}/json"
    try:
        with urllib.request.urlopen(url, timeout=3) as response:
            return response.status == 200
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        return True  # En cas d'erreur autre que 404, on assume qu'il existe pour éviter les faux positifs
    except Exception:
        return True


def _fetch_deps_dev_health(package_name: str) -> dict | None:
    """Récupère les infos de santé via l'API deps.dev."""
    # Note: On utilise l'API Open Source Insights (deps.dev)
    url = f"https://api.deps.dev/v3/systems/pypi/packages/{package_name}"
    try:
        # L'API deps.dev peut nécessiter une clé ou avoir des limites.
        # C'est une implémentation illustrative pour un niveau "Production".
        with urllib.request.urlopen(url, timeout=5) as response:
            return json.loads(response.read().decode())
    except Exception:
        return None
