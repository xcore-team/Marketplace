"""
hub-marketplace/src/gates/orchestrator.py
=========================================
Orchestrateur asynchrone pour exécuter les gates en parallèle.
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
from .steps.intake import gate_1
from .steps.runtime_sandbox import gate_11
from .steps.sandbox import gate_5
from .steps.secrets import gate_4
from .steps.signing import gate_7
from .steps.static_analysis import gate_2
from .steps.supply_chain import gate_3
from .steps.supply_health import gate_9

logger = logging.getLogger("hub.marketplace.gates")


class PipelineOrchestrator:
    def __init__(self, source_dir: Path, developer_id: str, secret_key: bytes):
        self.source_dir = source_dir
        self.developer_id = developer_id
        self.secret_key = secret_key

    async def run_all(
        self, submission_id: str, plugin_name: str, plugin_version: str
    ) -> SubmissionResult:
        with tracer.start_span("run_all") as span:
            span.set_attribute("submission_id", submission_id)
            span.set_attribute("plugin_name", plugin_name)

            started = time.time()
            logger.info(f"Démarrage du pipeline pour {plugin_name} v{plugin_version}")

            # 1. Gate 1 (Bloquante)
            with tracer.start_span("gate_1_intake"):
                g1_res = await gate_1(self.source_dir, known_names=set())

            if g1_res.anomaly_score >= 80:
                return self._make_submission_result(
                    submission_id, plugin_name, plugin_version, [g1_res], started
                )

            # 2. Gates Parallèles (2 à 9)
            with tracer.start_span("parallel_gates"):
                tasks = [
                    gate_2(self.source_dir),
                    gate_3(self.source_dir),
                    gate_4(self.source_dir),
                    gate_5(self.source_dir),
                    gate_6(self.source_dir),
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

            for _, res in enumerate(results):
                if isinstance(res, Exception):
                    logger.error(f"Erreur fatale dans une gate: {res}")
                    continue

                if isinstance(res, tuple):  # Gate 7 (signing)
                    gate_res, m_root, s_bundle = res
                    all_gate_results.append(gate_res)
                    merkle = m_root
                    sig_bundle = s_bundle
                else:
                    all_gate_results.append(res)

            return self._make_submission_result(
                submission_id,
                plugin_name,
                plugin_version,
                all_gate_results,
                started,
                merkle,
                sig_bundle,
            )

    def _make_submission_result(
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

        # Calcul du résumé des sévérités
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

        # Recommandation automatique
        rec = "Plugin sécurisé. Approbation recommandée."
        if status == SubmissionStatus.REJECTED:
            rec = "Plugin dangereux ou non conforme. Rejet immédiat."
        elif status == SubmissionStatus.MANUAL_REVIEW:
            rec = "Anomalies détectées. Une revue manuelle est nécessaire avant publication."

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
