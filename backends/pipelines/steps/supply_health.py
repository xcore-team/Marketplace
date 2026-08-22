"""Gate 9 — Supply Health (Dependency Confusion + OpenSSF Scorecard via deps.dev)."""

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

_INTERNAL_PREFIXES = ("xcore-", "hub-")


async def gate_9(source_dir: Path) -> GateResult:
    started = time.time()
    findings: list[Finding] = []
    score = 0

    req_file = source_dir / "requirements.txt"
    if not req_file.exists():
        return make_result("gate_9_supply_health", GateStatus.PASSED, 0, findings, started)

    try:
        content = req_file.read_text()
        packages = re.findall(r"^([a-zA-Z0-9_\-]+)", content, re.MULTILINE)
        unique_pkgs = sorted(set(packages))
        logger.info(f"[gate_9] Santé supply pour {len(unique_pkgs)} package(s)")

        for pkg in unique_pkgs:
            # 1. Dependency Confusion
            exists = _check_pypi_exists(pkg)
            if not exists:
                is_internal = any(pkg.startswith(p) for p in _INTERNAL_PREFIXES)
                if not is_internal:
                    findings.append(
                        Finding(
                            message=f"Risque Dependency Confusion : `{pkg}` n'existe pas sur PyPI",
                            severity=Severity.HIGH,
                            file="requirements.txt",
                            code=(
                                f"Package : {pkg}\n"
                                f"PyPI : https://pypi.org/project/{pkg}/ → introuvable\n"
                                f"Risque : un attaquant peut publier un package malveillant "
                                f"sous ce nom sur PyPI."
                            ),
                            remediation=(
                                f"Soit :\n"
                                f"1. Préfixez le package avec un namespace interne : `xcore-{pkg}` ou `hub-{pkg}`\n"
                                f"2. Publiez un package vide sous ce nom sur PyPI pour le réserver\n"
                                f"3. Utilisez un registry privé avec une politique de fallback stricte"
                            ),
                        )
                    )
                    score += SCORE_MAP[Severity.HIGH]
                else:
                    logger.debug(f"[gate_9] {pkg} : package interne (namespace OK)")
                continue

            # 2. OpenSSF Scorecard via deps.dev
            health = _fetch_deps_dev(pkg)
            if health is None:
                continue

            sc = health.get("scorecard")
            if not sc:
                continue

            overall = sc.get("overallScore", 10.0)
            checks = sc.get("checks", [])

            # Résumé des checks échoués
            failed_checks = [
                f"  {c['name']} : {c.get('score', '?')}/10"
                for c in checks
                if isinstance(c.get("score"), (int, float)) and c["score"] < 5
            ]

            if overall < 4.0:
                findings.append(
                    Finding(
                        message=f"`{pkg}` — score OpenSSF critique : {overall:.1f}/10",
                        severity=Severity.MEDIUM,
                        file="requirements.txt",
                        code=(
                            f"Score global : {overall:.1f}/10\n"
                            + ("\nChecks sous 5/10 :\n" + "\n".join(failed_checks) if failed_checks else "")
                        ),
                        remediation=(
                            f"Le package `{pkg}` a un score de sécurité OpenSSF très faible ({overall:.1f}/10). "
                            f"Consultez https://deps.dev/pypi/{pkg} pour les détails. "
                            "Envisagez de le remplacer par une alternative mieux maintenue."
                        ),
                    )
                )
                score += SCORE_MAP[Severity.MEDIUM]
            elif overall < 6.0:
                findings.append(
                    Finding(
                        message=f"`{pkg}` — score OpenSSF faible : {overall:.1f}/10",
                        severity=Severity.LOW,
                        file="requirements.txt",
                        code=(
                            f"Score global : {overall:.1f}/10\n"
                            + ("\nChecks sous 5/10 :\n" + "\n".join(failed_checks) if failed_checks else "")
                        ),
                        remediation=(
                            f"Surveillez l'évolution du score OpenSSF de `{pkg}` ({overall:.1f}/10). "
                            f"Détails : https://deps.dev/pypi/{pkg}"
                        ),
                    )
                )
                score += SCORE_MAP[Severity.LOW]
            else:
                logger.debug(f"[gate_9] {pkg} OpenSSF score : {overall:.1f}/10 ✓")

    except Exception as e:
        logger.error(f"[gate_9] Erreur : {e}")

    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )
    return make_result("gate_9_supply_health", status, score, findings, started)


def _check_pypi_exists(pkg: str) -> bool:
    try:
        with urllib.request.urlopen(f"https://pypi.org/pypi/{pkg}/json", timeout=4) as r:
            return r.status == 200
    except urllib.error.HTTPError as e:
        return e.code != 404
    except Exception:
        return True  # En cas de timeout, on assume existant pour éviter les faux positifs


def _fetch_deps_dev(pkg: str) -> dict | None:
    try:
        url = f"https://api.deps.dev/v3/systems/pypi/packages/{pkg}"
        with urllib.request.urlopen(url, timeout=5) as r:
            return json.loads(r.read().decode())
    except Exception:
        return None
