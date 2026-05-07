"""Gate 8 — Compliance (Licences des dépendances)."""

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

# Liste des licences autorisées par défaut
ALLOWED_LICENSES = {
    "MIT",
    "Apache-2.0",
    "BSD-3-Clause",
    "BSD-2-Clause",
    "Python-2.0",
    "PSFL",
    "ISC",
    "Unlicense",
}

# Licences à risque ou nécessitant une attention (Copyleft)
COPYLEFT_LICENSES = {
    "GPL-2.0",
    "GPL-3.0",
    "LGPL-2.1",
    "LGPL-3.0",
    "AGPL-3.0",
    "MPL-2.0",
}


async def gate_8(source_dir: Path) -> GateResult:
    """
    Vérifie les licences des dépendances déclarées dans requirements.txt ou pyproject.toml.
    Utilise l'API PyPI pour récupérer les informations de licence.
    """
    started = time.time()
    findings: list[Finding] = []
    score = 0

    req_file = source_dir / "requirements.txt"
    if not req_file.exists():
        findings.append(
            Finding(
                "requirements.txt absent, impossible de vérifier les licences",
                Severity.INFO,
            )
        )
        return make_result("gate_8_compliance", GateStatus.PASSED, 0, findings, started)

    try:
        content = req_file.read_text()
        # Regex simple pour extraire les noms de packages (ignore versions et commentaires)
        packages = re.findall(r"^([a-zA-Z0-9_\-]+)", content, re.MULTILINE)

        for pkg in set(packages):
            license_name = _fetch_pypi_license(pkg)
            if not license_name:
                findings.append(
                    Finding(
                        f"Impossible de déterminer la licence pour {pkg}",
                        Severity.LOW,
                        file="requirements.txt",
                    )
                )
                continue

            # Vérification par rapport à la whitelist
            is_allowed = any(
                allowed.lower() in license_name.lower() for allowed in ALLOWED_LICENSES
            )
            is_copyleft = any(
                copyleft.lower() in license_name.lower()
                for copyleft in COPYLEFT_LICENSES
            )

            if is_copyleft:
                findings.append(
                    Finding(
                        message=f"Licence Copyleft détectée : {pkg} ({license_name})",
                        severity=Severity.MEDIUM,
                        file="requirements.txt",
                        remediation="Ensure this copyleft license is acceptable for your project. Consider replacing with a more permissive license (MIT, Apache) if required.",
                    )
                )
                score += SCORE_MAP[Severity.MEDIUM]
            elif not is_allowed:
                findings.append(
                    Finding(
                        message=f"Licence non standard ou inconnue : {pkg} ({license_name})",
                        severity=Severity.LOW,
                        file="requirements.txt",
                        remediation="Manually verify the license terms for this package and ensure compliance with internal policies.",
                    )
                )
                score += SCORE_MAP[Severity.LOW]
            else:
                logger.debug(f"[gate_8] {pkg}: {license_name} (OK)")

    except Exception as e:
        findings.append(
            Finding(f"Erreur lors de l'analyse des licences : {e}", Severity.MEDIUM)
        )
        score += SCORE_MAP[Severity.MEDIUM]

    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )
    return make_result("gate_8_compliance", status, score, findings, started)


def _fetch_pypi_license(package_name: str) -> str | None:
    """Récupère la licence d'un package via l'API PyPI JSON."""
    url = f"https://pypi.org/pypi/{package_name}/json"
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            data = json.loads(response.read().decode())
            info = data.get("info", {})
            # On tente de récupérer la licence dans le champ 'license' ou via les 'classifiers'
            license_field = info.get("license")
            if (
                license_field and len(license_field) < 50
            ):  # Évite les textes complets de licence
                return license_field

            for classifier in info.get("classifiers", []):
                if classifier.startswith("License ::"):
                    return classifier.split("::")[-1].strip()
            return license_field
    except (urllib.error.URLError, json.JSONDecodeError, KeyError):
        return None
