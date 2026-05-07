"""sandbox/pipeline.py — SandboxedPipeline : extraction ZIP + toutes les gates via PipelineOrchestrator."""

from __future__ import annotations

import json
import logging
import shutil
import zipfile
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

    VERIFIED_DIR = Path(__file__).parent.parent / "verified"

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

        if result.status != SubmissionStatus.REJECTED:
            result.verified_zip_path = str(self._export_verified(result))

        return result

    # ─── helpers ─────────────────────────────────────────────────────────────

    def _export_verified(self, result: SubmissionResult) -> Path:
        """
        Sauvegarde le ZIP vérifié avec versionnage :
            verified/{plugin_slug}/{version}/{plugin_slug}-{version}.zip
            verified/{plugin_slug}/{version}/{plugin_slug}-{version}.sig.json

        Retourne le chemin du ZIP destinataire.
        """
        import re

        def _slugify(name: str) -> str:
            s = name.lower().strip()
            s = re.sub(r"[^\w\s-]", "", s)
            return re.sub(r"[\s_]+", "-", s)

        slug = _slugify(result.plugin_name)
        version = result.plugin_version

        version_dir = self.VERIFIED_DIR / slug / version
        version_dir.mkdir(parents=True, exist_ok=True)

        dest_zip = version_dir / f"{slug}-{version}.zip"
        shutil.copy2(self.zip_path, dest_zip)

        sig = {
            "submission_id": result.submission_id,
            "plugin_name": result.plugin_name,
            "plugin_version": version,
            "status": result.status.value,
            "anomaly_score": result.anomaly_score,
            "merkle_root": result.merkle_root,
            "sig_bundle": result.sig_bundle,
        }
        sig_path = version_dir / f"{slug}-{version}.sig.json"
        sig_path.write_text(json.dumps(sig, indent=2, ensure_ascii=False))

        logger.info(f"[SandboxedPipeline] ZIP vérifié → {dest_zip}")
        logger.info(f"[SandboxedPipeline] Signature → {sig_path}")
        return dest_zip

    def _extraction_failure(
        self,
        submission_id: str,
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
            developer_id=self.developer_id,
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
