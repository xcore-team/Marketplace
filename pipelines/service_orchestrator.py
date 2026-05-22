"""
pipelines/service_orchestrator.py
==================================
Orchestrateur du pipeline de validation pour les extensions de service.

Identique à PipelineOrchestrator sauf que Gate 1 est remplacée par
gate_1_service qui valide service.yaml + interface BaseService.
"""

from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path

from .common import tracer
from .models import (
    GateResult,
    Severity,
    SeveritySummary,
    SubmissionResult,
    SubmissionStatus,
    determine_status,
)
from .steps.behavioral import gate_6
from .steps.compliance import gate_8
from .steps.http_audit import gate_10
from .steps.runtime_sandbox import gate_11
from .steps.secrets import gate_4
from .steps.service_intake import gate_1_service
from .steps.service_sandbox import gate_5_service as gate_5
from .steps.signing import gate_7
from .steps.static_analysis import gate_2
from .steps.supply_chain import gate_3
from .steps.supply_health import gate_9

logger = logging.getLogger("hub.xservices.gates")


class ServicePipelineOrchestrator:
    def __init__(self, source_dir: Path, developer_id: str, secret_key: bytes):
        self.source_dir = source_dir
        self.developer_id = developer_id
        self.secret_key = secret_key

    async def run_all(
        self, submission_id: str, service_name: str, service_version: str
    ) -> SubmissionResult:
        with tracer.start_span("service_run_all") as span:
            span.set_attribute("submission_id", submission_id)
            span.set_attribute("service_name", service_name)

            started = time.time()
            logger.info(
                "Démarrage du pipeline service pour %s v%s",
                service_name,
                service_version,
            )

            # Gate 1 — bloquante, spécifique aux services
            with tracer.start_span("gate_1_service_intake"):
                g1_res = await gate_1_service(self.source_dir)

            if g1_res.anomaly_score >= 80:
                return self._make_result(
                    submission_id, service_name, service_version, [g1_res], started
                )

            # Gates 2-11 — identiques au pipeline plugin (génériques)
            with tracer.start_span("parallel_gates"):
                tasks = [
                    gate_2(self.source_dir),
                    gate_3(self.source_dir),
                    gate_4(self.source_dir),
                    gate_5(self.source_dir),
                    # gate_6(self.source_dir),
                    gate_7(self.source_dir, self.secret_key),
                    gate_8(self.source_dir),
                    gate_9(self.source_dir),
                    gate_10(self.source_dir),
                    gate_11(self.source_dir),
                ]
                results = await asyncio.gather(*tasks, return_exceptions=True)

            all_gate_results = [g1_res]
            merkle = None
            sig_bundle = None

            for res in results:
                if isinstance(res, Exception):
                    logger.error("Erreur fatale dans une gate service : %s", res)
                    continue
                if isinstance(
                    res, tuple
                ):  # gate_7 (signing) retourne (GateResult, merkle, sig)
                    gate_res, m_root, s_bundle = res
                    all_gate_results.append(gate_res)
                    merkle = m_root
                    sig_bundle = s_bundle
                else:
                    all_gate_results.append(res)

            return self._make_result(
                submission_id,
                service_name,
                service_version,
                all_gate_results,
                started,
                merkle,
                sig_bundle,
            )

    def _make_result(
        self,
        sub_id: str,
        name: str,
        version: str,
        gates: list[GateResult],
        started: float,
        merkle: str | None = None,
        sig_bundle: dict | None = None,
    ) -> SubmissionResult:
        total_score = sum(g.anomaly_score for g in gates)

        summary = SeveritySummary()
        for g in gates:
            for f in g.findings:
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

        status = determine_status(total_score)

        rec = "Extension de service sécurisée. Approbation recommandée."
        if status == SubmissionStatus.REJECTED:
            rec = "Extension dangereuse ou non conforme. Rejet immédiat."
        elif status == SubmissionStatus.MANUAL_REVIEW:
            rec = "Anomalies détectées. Revue manuelle nécessaire avant publication."

        return SubmissionResult(
            submission_id=sub_id,
            developer_id=self.developer_id,
            plugin_name=name,
            plugin_version=version,
            status=status,
            anomaly_score=total_score,
            summary=summary,
            merkle_root=merkle,
            sig_bundle=sig_bundle,
            gates=gates,
            recommendation=rec,
        )
