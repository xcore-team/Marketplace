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
    "xcore", "xcore-auth", "xcore-core", "xcore-sdk",
    "xcore-postgres", "xcore-redis", "hub-sandbox", "hub-marketplace",
}
_FORBIDDEN_FILES = [".env", "id_rsa", "id_ed25519", "*.pem", "*.key", "*.p12"]
_LOCKFILES = [
    "requirements.txt", "requirements.lock",
    "pyproject.toml", "Pipfile.lock", "poetry.lock",
]


async def gate_1(source_dir: Path, known_names: set[str]) -> GateResult:
    started = time.time()
    findings: list[Finding] = []
    score = 0
    plugin_name = ""
    plugin_version = ""

    # Fichiers interdits — vérifié avant _xcore_manifest pour éviter un faux positif :
    # _xcore_manifest appelle _ensure_dotenv qui crée un stub .env dans source_dir,
    # ce qui ferait détecter à tort un .env soumis par le développeur.
    for pattern in _FORBIDDEN_FILES:
        matches = [f for f in source_dir.rglob("*") if fnmatch.fnmatch(f.name, pattern)]
        if matches:
            for m in matches[:5]:
                rel = str(m.relative_to(source_dir))
                findings.append(
                    Finding(
                        f"Fichier sensible inclus dans le ZIP : `{m.name}`",
                        Severity.HIGH,
                        file=rel,
                        remediation=(
                            f"Supprimez `{rel}` du ZIP. Ajoutez-le à votre .gitignore. "
                            "Ne jamais inclure de clés, certificats ou fichiers .env dans un plugin."
                        ),
                    )
                )
            score += SCORE_MAP[Severity.HIGH]

    manifest = _xcore_manifest(source_dir)
    if manifest:
        plugin_name = manifest.name
        plugin_version = getattr(manifest, "version", "?")
        mode = getattr(manifest, "execution_mode", None)
        logger.info(
            f"[gate_1] {manifest.name} v{plugin_version} [{getattr(mode, 'value', mode)}]"
        )
    else:
        yaml_path = source_dir / "plugin.yaml"
        if not yaml_path.exists():
            findings.append(
                Finding(
                    "plugin.yaml introuvable à la racine du ZIP",
                    Severity.HIGH,
                    file="plugin.yaml",
                    remediation=(
                        "Créez un fichier plugin.yaml à la racine de votre plugin avec au minimum "
                        "`name`, `version` et `execution_mode` (sandboxed | trusted | legacy)."
                    ),
                )
            )
            score += SCORE_MAP[Severity.HIGH]
            return make_result("gate_1_intake", GateStatus.BLOCKED, score, findings, started)

        try:
            import yaml

            data = yaml.safe_load(yaml_path.read_text()) or {}
            plugin_name = data.get("name", "")
            plugin_version = data.get("version", "")

            missing = [f for f in ["name", "version", "execution_mode"] if not data.get(f)]
            for field in missing:
                sev = Severity.MEDIUM if field == "name" else Severity.LOW
                findings.append(
                    Finding(
                        f"Champ obligatoire manquant dans plugin.yaml : `{field}`",
                        sev,
                        file="plugin.yaml",
                        code=f"Champs présents : {list(data.keys())}",
                        remediation=f"Ajoutez `{field}:` dans plugin.yaml.",
                    )
                )
                score += SCORE_MAP[sev]

            if not plugin_name:
                return make_result("gate_1_intake", GateStatus.BLOCKED, score, findings, started)

        except Exception as e:
            findings.append(
                Finding(
                    f"plugin.yaml illisible : {e}",
                    Severity.MEDIUM,
                    file="plugin.yaml",
                    remediation="Vérifiez la syntaxe YAML avec `python -c \"import yaml; yaml.safe_load(open('plugin.yaml'))\"` avant de soumettre.",
                )
            )
            score += SCORE_MAP[Severity.MEDIUM]
            return make_result("gate_1_intake", GateStatus.BLOCKED, score, findings, started)

    # Lockfile
    found_lockfile = next((lf for lf in _LOCKFILES if (source_dir / lf).exists()), None)
    if found_lockfile:
        logger.info(f"[gate_1] Lockfile trouvé : {found_lockfile}")
    else:
        findings.append(
            Finding(
                "Aucun fichier de dépendances trouvé",
                Severity.LOW,
                remediation=(
                    f"Ajoutez l'un de ces fichiers : {', '.join(_LOCKFILES)}. "
                    "Sans lockfile, les gates supply-chain (3) et compliance (8) seront limités."
                ),
            )
        )
        score += SCORE_MAP[Severity.LOW]

    # Typosquatting
    if plugin_name:
        for protected in _PROTECTED_NAMES:
            if plugin_name == protected:
                findings.append(
                    Finding(
                        f"Nom réservé : `{plugin_name}` est un composant système XCore",
                        Severity.HIGH,
                        file="plugin.yaml",
                        remediation=f"Choisissez un nom différent. `{plugin_name}` est réservé.",
                    )
                )
                score += SCORE_MAP[Severity.HIGH]
            else:
                n1 = plugin_name.replace("-", "").replace("_", "").lower()
                n2 = protected.replace("-", "").replace("_", "").lower()
                if n1 == n2:
                    findings.append(
                        Finding(
                            f"Typosquatting détecté : `{plugin_name}` ressemble à `{protected}`",
                            Severity.MEDIUM,
                            file="plugin.yaml",
                            code=f"Votre nom : {plugin_name!r}  →  Cible suspectée : {protected!r}",
                            remediation="Renommez votre plugin pour éviter toute confusion avec les packages système.",
                        )
                    )
                    score += SCORE_MAP[Severity.MEDIUM]

    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )
    return make_result("gate_1_intake", status, score, findings, started)


def _xcore_manifest(source_dir: Path):
    from ..common import _xcore_manifest
    return _xcore_manifest(source_dir)
