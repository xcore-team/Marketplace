"""sandbox/pipeline.py — SandboxedPipeline : extraction ZIP + toutes les gates via PipelineOrchestrator."""

from __future__ import annotations

import logging
from pathlib import Path

from pipelines.models import (
    Finding,
    GateResult,
    GateStatus,
    Severity,
    SubmissionResult,
    SubmissionStatus,
    SeveritySummary,
)
from pipelines.orchestrator import PipelineOrchestrator

from .extractor import ExtractionError, cleanup, extract_plugin
from .runner import SandboxLimits

from pipelines.service_orchestrator import ServicePipelineOrchestrator

logger = logging.getLogger("hub.marketplace.sandbox")


class SandboxedPipeline:
    """
    Combine le sandbox (dézip /tmp + limites mémoire/CPU) et le PipelineOrchestrator
    (toutes les gates).

    Usage:
        pipeline = SandboxedPipeline(
            zip_path="plugin.zip",
            developer_id="dev-42",
            secret_key=b"...",
            limits=SandboxLimits(memory_mb=256, cpu_seconds=15),
        )
        result = await pipeline.run(submission_id="sub-001", plugin_name="my-plugin", plugin_version="1.0.0")
    """

    def __init__(
        self,
        zip_path: str | Path,
        developer_id: str,
        secret_key: bytes,
        limits: SandboxLimits | None = None,
    ):
        self.zip_path = Path(zip_path)
        self.developer_id = developer_id
        self.secret_key = secret_key
        self.limits = limits or SandboxLimits()

    async def run(
        self,
        submission_id: str,
        plugin_name: str,
        plugin_version: str,
    ) -> SubmissionResult:
        """
        1. Extrait l'archive vers /tmp
        2. Lance toutes les gates via PipelineOrchestrator
        3. Nettoie /tmp
        """
        # ── 1. Extraction ────────────────────────────────────────────────────
        logger.info(f"[SandboxedPipeline] Extraction de '{self.zip_path.name}'")
        try:
            source_dir = extract_plugin(self.zip_path)
        except ExtractionError as exc:
            return self._extraction_failure(submission_id, plugin_name, plugin_version, exc)

        # ── 2. Toutes les gates ──────────────────────────────────────────────
        try:
            logger.info(f"[SandboxedPipeline] Lancement du pipeline dans {source_dir}")
            orchestrator = PipelineOrchestrator(
                source_dir=source_dir,
                developer_id=self.developer_id,
                secret_key=self.secret_key,
            )
            result = await orchestrator.run_all(submission_id, plugin_name, plugin_version)
        finally:
            cleanup(source_dir)
            logger.info(f"[SandboxedPipeline] Nettoyage {source_dir}")

        return result

    # ─── helpers ─────────────────────────────────────────────────────────────


    @staticmethod
    def _make_extraction_failure(
        submission_id: str,
        developer_id: str,
        plugin_name: str,
        plugin_version: str,
        exc: ExtractionError,
    ) -> SubmissionResult:
        gate_res = GateResult(
            gate="sandbox_extract",
            status=GateStatus.BLOCKED,
            anomaly_score=80,
            findings=[Finding(f"Extraction échouée : {exc}", Severity.CRITICAL)],
        )
        return SubmissionResult(
            submission_id=submission_id,
            developer_id=developer_id,
            plugin_name=plugin_name,
            plugin_version=plugin_version,
            status=SubmissionStatus.REJECTED,
            anomaly_score=80,
            summary=SeveritySummary(critical=1),
            merkle_root=None,
            sig_bundle=None,
            gates=[gate_res],
            recommendation="Archive invalide ou corrompue. Rejet immédiat.",
        )

    def _extraction_failure(
        self,
        submission_id: str,
        plugin_name: str,
        plugin_version: str,
        exc: ExtractionError,
    ) -> SubmissionResult:
        return self._make_extraction_failure(
            submission_id, self.developer_id, plugin_name, plugin_version, exc
        )


class SandboxedServicePipeline:
    """
    Même flux que SandboxedPipeline mais utilise ServicePipelineOrchestrator
    (Gate 1 validant service.yaml + interface BaseService au lieu de plugin.yaml).
    """

    def __init__(
        self,
        zip_path: str | Path,
        developer_id: str,
        secret_key: bytes,
        limits: SandboxLimits | None = None,
    ):
        self.zip_path = Path(zip_path)
        self.developer_id = developer_id
        self.secret_key = secret_key
        self.limits = limits or SandboxLimits()

    async def run(
        self,
        submission_id: str,
        service_name: str,
        service_version: str,
    ) -> SubmissionResult:
        logger.info("[SandboxedServicePipeline] Extraction de '%s'", self.zip_path.name)
        try:
            source_dir = extract_plugin(self.zip_path)
        except ExtractionError as exc:
            return SandboxedPipeline._make_extraction_failure(
                submission_id, self.developer_id, service_name, service_version, exc
            )

        try:
            logger.info("[SandboxedServicePipeline] Lancement du pipeline dans %s", source_dir)
            orchestrator = ServicePipelineOrchestrator(
                source_dir=source_dir,
                developer_id=self.developer_id,
                secret_key=self.secret_key,
            )
            result = await orchestrator.run_all(submission_id, service_name, service_version)
        finally:
            cleanup(source_dir)
            logger.info("[SandboxedServicePipeline] Nettoyage %s", source_dir)

        return result
