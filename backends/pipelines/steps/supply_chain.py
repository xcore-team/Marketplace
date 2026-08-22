"""Gate 3 — Supply chain (pip-audit + dépendances directes par URL)."""

from __future__ import annotations

import json
import logging
import re
import time
from pathlib import Path

from ..common import _run, tool_path
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
                "Aucun fichier de dépendances trouvé — audit supply chain impossible",
                Severity.MEDIUM,
                remediation=(
                    "Ajoutez un requirements.txt (pip freeze > requirements.txt) "
                    "ou un pyproject.toml avec vos dépendances déclarées."
                ),
            )
        )
        score += SCORE_MAP[Severity.MEDIUM]
        return make_result("gate_3_supply_chain", GateStatus.FAILED, score, findings, started)

    target_file = req if req.exists() else pyp
    target = str(target_file)
    logger.info(f"[gate_3] Audit supply chain sur {target_file.name}")

    rc, stdout, stderr = _run(
        [tool_path("pip-audit"), "--requirement", target, "--format", "json", "--progress-spinner", "off"],
        timeout=120,
    )

    if rc == 0:
        logger.info("[gate_3] pip-audit : aucune vulnérabilité connue")
    elif rc == 1 and stdout.strip():
        try:
            audit_data = json.loads(stdout)
            # pip-audit --format json renvoie {"dependencies": [{"name","version","vulns":[...]}], "fixes": []} —
            # jamais de clé top-level "vulnerabilities". Avec l'ancienne clé, .get()
            # retombait silencieusement sur [] à chaque scan : aucune exception, aucun
            # finding, gate_3 passait toujours à 0 quel que soit ce que pip-audit trouvait
            # réellement (confirmé : requests==2.25.0 a 14 CVE connues via `pip-audit`
            # en CLI direct, 0 remontée ici avant ce correctif).
            vulns = audit_data.get("dependencies", [])
            logger.info(f"[gate_3] pip-audit : {len(vulns)} paquet(s) audité(s)")

            for vuln in vulns:
                pkg = vuln.get("name", "?")
                vers = vuln.get("version", "?")
                cve_list = vuln.get("vulns", [])

                for cve in cve_list:
                    cve_id = cve.get("id", "?")
                    fix_versions = cve.get("fix_versions", [])
                    aliases = cve.get("aliases", [])
                    description = cve.get("description", "")

                    has_fix = bool(fix_versions)
                    sev = Severity.MEDIUM if has_fix else Severity.HIGH

                    # Résumé de la vulnérabilité
                    all_ids = ", ".join([cve_id] + aliases) if aliases else cve_id
                    fix_str = f"→ fix disponible : {', '.join(fix_versions)}" if has_fix else "→ aucun fix automatique disponible"

                    code_snippet = f"{pkg}=={vers}"
                    if description:
                        code_snippet += f"\n{description[:200]}"

                    remediation = (
                        f"Mettez à jour `{pkg}` vers {' ou '.join(fix_versions)}. "
                        f"Exécutez : pip install \"{pkg}>={fix_versions[0]}\""
                    ) if has_fix else (
                        f"Aucune version corrigée pour `{pkg}`. Envisagez de remplacer "
                        f"cette dépendance ou d'appliquer un patch manuel. "
                        f"Consultez : https://osv.dev/vulnerability/{cve_id}"
                    )

                    findings.append(
                        Finding(
                            message=f"{all_ids} dans `{pkg}=={vers}` {fix_str}",
                            severity=sev,
                            file=target_file.name,
                            code=code_snippet,
                            remediation=remediation,
                        )
                    )
                    score += SCORE_MAP[sev]

        except json.JSONDecodeError as e:
            logger.warning(f"[gate_3] Parse pip-audit JSON échoué : {e}")
    elif stderr:
        stderr_short = stderr.strip()[:200]
        findings.append(
            Finding(
                f"pip-audit n'a pas pu s'exécuter correctement",
                Severity.INFO,
                code=stderr_short,
                remediation="Vérifiez que pip-audit est installé : `pip install pip-audit`",
            )
        )

    # Dépendances par URL directe (non vérifiables / non reproductibles)
    if req.exists():
        content = req.read_text(errors="ignore")
        for lineno, line in enumerate(content.splitlines(), 1):
            urls = _URL_DEP_RE.findall(line)
            for url in urls:
                findings.append(
                    Finding(
                        message=f"Dépendance par URL directe — non auditée par pip-audit",
                        severity=Severity.MEDIUM,
                        file="requirements.txt",
                        line=lineno,
                        code=line.strip(),
                        remediation=(
                            f"Évitez les dépendances directes par URL ({url[:60]}…). "
                            "Utilisez PyPI ou un registry privé versionné pour garantir "
                            "la reproductibilité et l'auditabilité des dépendances."
                        ),
                    )
                )
                score += SCORE_MAP[Severity.MEDIUM]

    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )
    return make_result("gate_3_supply_chain", status, score, findings, started)
