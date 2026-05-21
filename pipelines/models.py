"""hub-marketplace/src/gates/models.py — Modèles partagés entre les 7 gates."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path


class GateStatus(str, Enum):
    PASSED = "passed"
    FAILED = "failed"
    BLOCKED = "blocked"  # arrêt immédiat pipeline


class SubmissionStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    MANUAL_REVIEW = "manual_review"


class Severity(str, Enum):
    CRITICAL = "critical"  # Bloque immédiatement (score high)
    HIGH = "high"  # Risque important
    MEDIUM = "medium"  # Risque modéré
    LOW = "low"  # Risque mineur
    INFO = "info"  # Information / Meilleure pratique


SCORE_MAP = {
    Severity.CRITICAL: 80,
    Severity.HIGH: 40,
    Severity.MEDIUM: 20,
    Severity.LOW: 5,
    Severity.INFO: 0,
}

SCORE_AUTO_APPROVE = 20
SCORE_HIGH_PRIORITY = 50
SCORE_AUTO_REJECT = 80


@dataclass
class Finding:
    message: str
    severity: Severity = Severity.MEDIUM
    file: str | None = None
    line: int | None = None
    code: str | None = None  # Snippet de code concerné
    remediation: str | None = None  # Conseil pour corriger le problème

    def to_dict(self) -> dict:
        return {
            "message": self.message,
            "severity": self.severity.value,
            "file": self.file,
            "line": self.line,
            "code": self.code,
            "remediation": self.remediation,
        }


@dataclass
class GateResult:
    gate: str
    status: GateStatus
    anomaly_score: int
    findings: list[Finding] = field(default_factory=list)
    duration_seconds: float = 0.0
    completed_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "gate": self.gate,
            "status": self.status.value,
            "anomaly_score": self.anomaly_score,
            "findings": [f.to_dict() for f in self.findings],
            "duration_seconds": self.duration_seconds,
            "completed_at": self.completed_at,
        }


@dataclass
class SeveritySummary:
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0

    def to_dict(self) -> dict:
        return {
            "critical": self.critical,
            "high": self.high,
            "medium": self.medium,
            "low": self.low,
            "info": self.info,
        }


@dataclass
class SubmissionResult:
    submission_id: str
    developer_id: str
    plugin_name: str
    plugin_version: str
    status: SubmissionStatus
    anomaly_score: int
    summary: SeveritySummary
    merkle_root: str | None
    sig_bundle: dict | None
    gates: list[GateResult]
    recommendation: str | None = None
    error: str | None = None
    verified_zip_path: str | None = None  # chemin versionné du ZIP après validation

    def to_dict(self) -> dict:
        return {
            "submission_id": self.submission_id,
            "developer_id": self.developer_id,
            "plugin_name": self.plugin_name,
            "plugin_version": self.plugin_version,
            "status": self.status.value,
            "anomaly_score": self.anomaly_score,
            "summary": self.summary.to_dict(),
            "merkle_root": self.merkle_root,
            "sig_bundle": self.sig_bundle,
            "gates": [g.to_dict() for g in self.gates],
            "recommendation": self.recommendation,
            "error": self.error,
        }

    def export_json(self, output_path: str | Path) -> None:
        """Exports the result to a JSON file."""
        import json
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, indent=4, ensure_ascii=False)


def make_result(
    gate: str,
    status: GateStatus,
    score: int,
    findings: list[Finding],
    started: float,
) -> GateResult:
    return GateResult(
        gate=gate,
        status=status,
        anomaly_score=score,
        findings=findings,
        duration_seconds=round(time.time() - started, 4),
    )


def determine_status(score: int) -> SubmissionStatus:
    if score >= SCORE_AUTO_REJECT:
        return SubmissionStatus.REJECTED
    if score >= SCORE_AUTO_APPROVE:
        return SubmissionStatus.MANUAL_REVIEW
    return SubmissionStatus.APPROVED
