"""Gate 8 — Compliance (Licences des dépendances via PyPI)."""

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

ALLOWED_LICENSES = {
    "MIT",
    "Apache-2.0",
    "Apache 2.0",
    "BSD-3-Clause",
    "BSD-2-Clause",
    "Python-2.0",
    "BSD",
    "BSD License",
    "PSFL",
    "UNKNOWN",
    "ISC",
    "Unlicense",
    "CC0-1.0",
}

COPYLEFT_LICENSES = {
    "GPL-2.0",
    "GPL-3.0",
    "LGPL-2.1",
    "LGPL-3.0",
    "AGPL-3.0",
    "MPL-2.0",
    "EUPL-1.2",
    "OSL-3.0",
}


async def gate_8(source_dir: Path) -> GateResult:
    started = time.time()
    findings: list[Finding] = []
    score = 0

    req_file = source_dir / "requirements.txt"
    if not req_file.exists():
        findings.append(
            Finding(
                "requirements.txt absent — vérification des licences ignorée",
                Severity.INFO,
            )
        )
        return make_result("gate_8_compliance", GateStatus.PASSED, 0, findings, started)

    try:
        content = req_file.read_text()
        packages = re.findall(r"^([a-zA-Z0-9_\-]+)", content, re.MULTILINE)
        unique_pkgs = sorted(set(packages))
        logger.info(
            f"[gate_8] Vérification licences pour {len(unique_pkgs)} package(s)"
        )

        for pkg in unique_pkgs:
            result = _fetch_pypi_license(pkg)
            if result is None:
                findings.append(
                    Finding(
                        f"Impossible de récupérer les infos de licence pour `{pkg}` (PyPI timeout ou introuvable)",
                        Severity.LOW,
                        file="requirements.txt",
                        remediation=(
                            f"Vérifiez manuellement la licence de `{pkg}` sur https://pypi.org/project/{pkg}/ "
                            "et assurez-vous qu'elle est compatible avec votre projet."
                        ),
                    )
                )
                continue

            license_name, pypi_url = result

            is_allowed = any(
                a.lower() in license_name.lower() for a in ALLOWED_LICENSES
            )
            is_copyleft = any(
                c.lower() in license_name.lower() for c in COPYLEFT_LICENSES
            )

            if is_copyleft:
                findings.append(
                    Finding(
                        message=f"Licence Copyleft `{license_name}` détectée pour `{pkg}`",
                        severity=Severity.MEDIUM,
                        file="requirements.txt",
                        code=f"Package : {pkg}\nLicence : {license_name}\nPyPI : {pypi_url}",
                        remediation=(
                            f"La licence {license_name} impose des obligations de partage du code source (copyleft). "
                            f"Vérifiez la compatibilité avec votre licence. Si non acceptable, remplacez `{pkg}` "
                            f"par un équivalent sous licence permissive (MIT, Apache-2.0)."
                        ),
                    )
                )
                score += SCORE_MAP[Severity.MEDIUM]
            elif not is_allowed:
                findings.append(
                    Finding(
                        message=f"Licence non standard `{license_name}` pour `{pkg}`",
                        severity=Severity.LOW,
                        file="requirements.txt",
                        code=f"Package : {pkg}\nLicence : {license_name}\nPyPI : {pypi_url}",
                        remediation=(
                            f"La licence `{license_name}` n'est pas dans la liste des licences approuvées. "
                            f"Vérifiez manuellement sur {pypi_url} que cette licence autorise l'usage commercial/distribution."
                        ),
                    )
                )
                score += SCORE_MAP[Severity.LOW]
            else:
                logger.debug(f"[gate_8] {pkg}: {license_name} ✓")

    except Exception as e:
        findings.append(
            Finding(
                f"Erreur inattendue lors de l'analyse des licences : {type(e).__name__}: {e}",
                Severity.MEDIUM,
            )
        )
        score += SCORE_MAP[Severity.MEDIUM]

    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )
    return make_result("gate_8_compliance", status, score, findings, started)


def _fetch_pypi_license(package_name: str) -> tuple[str, str] | None:
    """Retourne (license_str, pypi_url) ou None si introuvable."""
    url = f"https://pypi.org/pypi/{package_name}/json"
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            data = json.loads(response.read().decode())
            info = data.get("info", {})
            pypi_url = f"https://pypi.org/project/{package_name}/"

            license_field = info.get("license", "") or ""
            # Évite les textes complets de licence
            if license_field and len(license_field) < 80:
                return license_field.strip(), pypi_url

            # Fallback sur les classifiers
            for classifier in info.get("classifiers", []):
                if classifier.startswith("License ::"):
                    return classifier.split("::")[-1].strip(), pypi_url

            return (license_field[:80] if license_field else "UNKNOWN"), pypi_url
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return "NOT_ON_PYPI", f"https://pypi.org/project/{package_name}/"
        return None
    except Exception:
        return None
