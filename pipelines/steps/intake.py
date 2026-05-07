"""Gate 1 — Intake: Validation du manifeste, lockfile, typosquatting, fichiers interdits."""

from __future__ import annotations

import fnmatch
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

logger = logging.getLogger("hub.marketplace.gates")

_PROTECTED_NAMES = {
    "xcore",
    "xcore-auth",
    "xcore-core",
    "xcore-sdk",
    "xcore-postgres",
    "xcore-redis",
    "hub-sandbox",
    "hub-marketplace",
}
_FORBIDDEN_FILES = [".env", "id_rsa", "id_ed25519", "*.pem", "*.key", "*.p12"]
_LOCKFILES = [
    "requirements.txt",
    "requirements.lock",
    "pyproject.toml",
    "Pipfile.lock",
    "poetry.lock",
]


async def gate_1(source_dir: Path, known_names: set[str]) -> GateResult:
    """
    Validation du manifeste, lockfile, typosquatting, fichiers interdits.
    known_names : noms déjà publiés sur le marketplace (fourni par pipeline.py).
    """
    started = time.time()
    findings: list[Finding] = []
    score = 0
    plugin_name = ""

    manifest = _xcore_manifest(source_dir)
    if manifest:
        plugin_name = manifest.name
        logger.info(
            f"[gate_1] {manifest.name} v{manifest.version} [{manifest.execution_mode.value}]"
        )
    else:
        yaml_path = source_dir / "plugin.yaml"
        if not yaml_path.exists():
            findings.append(
                Finding(
                    "plugin.yaml introuvable",
                    Severity.HIGH,
                    remediation="Please check your plugin.yaml file.",
                )
            )
            score += SCORE_MAP[Severity.HIGH]
            return make_result(
                "gate_1_intake", GateStatus.BLOCKED, score, findings, started
            )
        try:
            import yaml

            data = yaml.safe_load(yaml_path.read_text()) or {}
            plugin_name = data.get("name", "")
            if not plugin_name:
                findings.append(
                    Finding(
                        "'name' manquant dans plugin.yaml",
                        Severity.MEDIUM,
                        remediation="Please check your plugin.yaml file.",
                    )
                )
                score += SCORE_MAP[Severity.MEDIUM]
            if not data.get("version"):
                findings.append(
                    Finding(
                        "'version' manquant dans plugin.yaml",
                        Severity.LOW,
                        remediation="Please check your plugin.yaml file.",
                    )
                )
                score += SCORE_MAP[Severity.LOW]
        except Exception as e:
            findings.append(
                Finding(
                    f"plugin.yaml illisible : {e}",
                    Severity.MEDIUM,
                    remediation="Please check your plugin.yaml file.",
                )
            )
            score += SCORE_MAP[Severity.MEDIUM]
            return make_result(
                "gate_1_intake", GateStatus.BLOCKED, score, findings, started
            )

    if not any((source_dir / lf).exists() for lf in _LOCKFILES):
        findings.append(
            Finding(
                "Aucun lockfile trouvé",
                Severity.LOW,
                remediation="Please check your plugin.yaml file.",
            )
        )
        score += SCORE_MAP[Severity.LOW]

    if plugin_name:
        for protected in _PROTECTED_NAMES:
            if plugin_name != protected:
                n1 = plugin_name.replace("-", "").replace("_", "").lower()
                n2 = protected.replace("-", "").replace("_", "").lower()
                if n1 == n2:
                    findings.append(
                        Finding(
                            f"Typosquatting : '{plugin_name}' ≈ '{protected}'",
                            Severity.MEDIUM,
                            remediation="Please check your plugin.yaml file.",
                        )
                    )
                    score += SCORE_MAP[Severity.MEDIUM]

    for pattern in _FORBIDDEN_FILES:
        matches = [f for f in source_dir.rglob("*") if fnmatch.fnmatch(f.name, pattern)]
        if matches:
            for m in matches[:3]:
                findings.append(
                    Finding(
                        f"Fichier interdit : {m.name}",
                        Severity.HIGH,
                        file=str(m.relative_to(source_dir)),
                        remediation="Please remove any forbidden files from the package.",
                    )
                )
            score += SCORE_MAP[Severity.HIGH]

    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )
    return make_result("gate_1_intake", status, score, findings, started)


def _xcore_manifest(source_dir: Path):
    from ..common import _xcore_manifest

    return _xcore_manifest(source_dir)
