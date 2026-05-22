"""Gate 1 (service) — Intake: Validation du manifeste service.yaml, lockfile, fichiers interdits."""

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

logger = logging.getLogger("hub.xservices.gates")

_PROTECTED_NAMES = {
    "xcore", "xcore-auth", "xcore-core", "xcore-sdk",
    "xcore-postgres", "xcore-redis", "hub-sandbox", "hub-marketplace",
    "xservices", "hub-xservices",
}
_FORBIDDEN_FILES = [".env", "id_rsa", "id_ed25519", "*.pem", "*.key", "*.p12"]
_LOCKFILES = [
    "requirements.txt", "requirements.lock",
    "pyproject.toml", "Pipfile.lock", "poetry.lock",
]
_REQUIRED_FIELDS = ["name", "version", "entry_class"]


async def gate_1_service(source_dir: Path) -> GateResult:
    started = time.time()
    findings: list[Finding] = []
    score = 0
    service_name = ""

    # Fichiers interdits — vérifié avant le manifeste pour ne pas confondre
    # un .env soumis par le développeur avec un stub généré plus tard.
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
                            f"Supprimez `{rel}` du ZIP. "
                            "Ne jamais inclure de clés, certificats ou fichiers .env dans une extension."
                        ),
                    )
                )
            score += SCORE_MAP[Severity.HIGH]

    # Manifeste service.yaml
    yaml_path = source_dir / "service.yaml"
    if not yaml_path.exists():
        findings.append(
            Finding(
                "service.yaml introuvable à la racine du ZIP",
                Severity.HIGH,
                file="service.yaml",
                remediation=(
                    "Créez un fichier service.yaml à la racine de votre extension avec au minimum "
                    "`name`, `version` et `entry_class`."
                ),
            )
        )
        score += SCORE_MAP[Severity.HIGH]
        return make_result("gate_1_service_intake", GateStatus.BLOCKED, score, findings, started)

    try:
        import yaml

        data = yaml.safe_load(yaml_path.read_text(encoding="utf-8")) or {}
    except Exception as e:
        findings.append(
            Finding(
                f"service.yaml illisible : {e}",
                Severity.MEDIUM,
                file="service.yaml",
                remediation="Vérifiez la syntaxe YAML avec `python -c \"import yaml; yaml.safe_load(open('service.yaml'))\"` avant de soumettre.",
            )
        )
        score += SCORE_MAP[Severity.MEDIUM]
        return make_result("gate_1_service_intake", GateStatus.BLOCKED, score, findings, started)

    # entry_class peut aussi être déclaré comme `module`
    effective_entry = data.get("entry_class") or data.get("module")
    resolved = {**data, "entry_class": effective_entry}

    missing = [f for f in _REQUIRED_FIELDS if not resolved.get(f)]
    for field_name in missing:
        sev = Severity.HIGH if field_name == "entry_class" else Severity.MEDIUM
        findings.append(
            Finding(
                f"Champ obligatoire manquant dans service.yaml : `{field_name}`",
                sev,
                file="service.yaml",
                code=f"Champs présents : {list(data.keys())}",
                remediation=f"Ajoutez `{field_name}:` dans service.yaml.",
            )
        )
        score += SCORE_MAP[sev]

    service_name = data.get("name", "")
    service_version = data.get("version", "?")

    if not service_name:
        return make_result("gate_1_service_intake", GateStatus.BLOCKED, score, findings, started)

    logger.info("[gate_1_service] %s v%s", service_name, service_version)

    # Lockfile
    found_lockfile = next((lf for lf in _LOCKFILES if (source_dir / lf).exists()), None)
    if found_lockfile:
        logger.info("[gate_1_service] Lockfile trouvé : %s", found_lockfile)
    else:
        findings.append(
            Finding(
                "Aucun fichier de dépendances trouvé",
                Severity.LOW,
                remediation=(
                    f"Ajoutez l'un de ces fichiers : {', '.join(_LOCKFILES)}. "
                    "Sans lockfile, les gates supply-chain et compliance seront limités."
                ),
            )
        )
        score += SCORE_MAP[Severity.LOW]

    # Typosquatting
    for protected in _PROTECTED_NAMES:
        if service_name == protected:
            findings.append(
                Finding(
                    f"Nom réservé : `{service_name}` est un composant système XCore",
                    Severity.HIGH,
                    file="service.yaml",
                    remediation=f"Choisissez un nom différent. `{service_name}` est réservé.",
                )
            )
            score += SCORE_MAP[Severity.HIGH]
        else:
            n1 = service_name.replace("-", "").replace("_", "").lower()
            n2 = protected.replace("-", "").replace("_", "").lower()
            if n1 == n2:
                findings.append(
                    Finding(
                        f"Typosquatting détecté : `{service_name}` ressemble à `{protected}`",
                        Severity.MEDIUM,
                        file="service.yaml",
                        code=f"Votre nom : {service_name!r}  →  Cible suspectée : {protected!r}",
                        remediation="Renommez votre extension pour éviter toute confusion avec les composants système.",
                    )
                )
                score += SCORE_MAP[Severity.MEDIUM]

    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )
    return make_result("gate_1_service_intake", status, score, findings, started)
