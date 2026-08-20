"""
sandbox — Module de validation sécurisée de plugins.

Flux :
  1. Extraire l'archive ZIP vers /tmp
  2. Exécuter le plugin dans un subprocess avec limites mémoire/CPU
  3. Valider via gate_5
  4. Nettoyer /tmp

Usage rapide :
    from sandbox import validate_plugin, SandboxLimits

    result = await validate_plugin("plugin.zip", limits=SandboxLimits(memory_mb=128))
    print(result.to_dict())
"""

from __future__ import annotations

import logging
from pathlib import Path

from .extractor import ExtractionError, cleanup, extract_plugin
from .pipeline import SandboxedPipeline, SandboxedServicePipeline
from .runner import SandboxLimits, SandboxRunner

logger = logging.getLogger("hub.marketplace.sandbox")

__all__ = [
    "SandboxLimits",
    "SandboxRunner",
    "SandboxedPipeline",
    "SandboxedServicePipeline",
    "ExtractionError",
    "validate_plugin",
]


async def validate_plugin(
    zip_path: str | Path,
    limits: SandboxLimits | None = None,
    developer_id: str = "unknown",
):
    """
    Pipeline complet : dézip → sandbox → gate_5.

    Returns:
        pipelines.models.SubmissionResult
    """
    from pipelines.models import (
        Finding,
        GateResult,
        GateStatus,
        Severity,
        SubmissionResult,
        SubmissionStatus,
        SeveritySummary,
        determine_status,
    )
    from pipelines.steps.sandbox import gate_5

    zip_path = Path(zip_path)
    limits = limits or SandboxLimits()

    # ── 1. Extraction ────────────────────────────────────────────────────────
    logger.info(f"[sandbox] Extraction de {zip_path.name}")
    try:
        source_dir = extract_plugin(zip_path)
    except ExtractionError as exc:
        finding = Finding(f"Extraction échouée : {exc}", Severity.CRITICAL)
        gate_res = GateResult(
            gate="sandbox_extract",
            status=GateStatus.BLOCKED,
            anomaly_score=80,
            findings=[finding],
        )
        summary = SeveritySummary(critical=1)
        return SubmissionResult(
            submission_id="n/a",
            developer_id=developer_id,
            plugin_name=zip_path.stem,
            plugin_version="unknown",
            status=SubmissionStatus.REJECTED,
            anomaly_score=80,
            summary=summary,
            merkle_root=None,
            sig_bundle=None,
            gates=[gate_res],
            recommendation="Archive invalide ou corrompue.",
        )

    # ── 2. Gate 5 (sandbox + validation) ────────────────────────────────────
    try:
        logger.info(f"[sandbox] Validation gate_5 dans {source_dir}")
        gate_res = await gate_5(source_dir, timeout=limits.timeout)
    finally:
        cleanup(source_dir)
        logger.info(f"[sandbox] Nettoyage {source_dir}")

    total_score = gate_res.anomaly_score
    status = determine_status(total_score)

    summary = SeveritySummary()
    for f in gate_res.findings:
        if f.severity == Severity.CRITICAL:
            summary.critical += 1
        elif f.severity == Severity.HIGH:
            summary.high += 1
        elif f.severity == Severity.MEDIUM:
            summary.medium += 1
        elif f.severity == Severity.LOW:
            summary.low += 1
        elif f.severity == Severity.INFO:
            summary.info += 1

    rec = {
        SubmissionStatus.APPROVED: "Plugin validé. Approbation recommandée.",
        SubmissionStatus.REJECTED: "Plugin dangereux. Rejet immédiat.",
        SubmissionStatus.MANUAL_REVIEW: "Anomalies détectées. Revue manuelle requise.",
    }.get(status, "")

    return SubmissionResult(
        submission_id="n/a",
        developer_id=developer_id,
        plugin_name=zip_path.stem,
        plugin_version="unknown",
        status=status,
        anomaly_score=total_score,
        summary=summary,
        merkle_root=None,
        sig_bundle=None,
        gates=[gate_res],
        recommendation=rec,
    )
