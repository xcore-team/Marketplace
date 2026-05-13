"""Tests unitaires — modèles pipeline (determine_status, SubmissionResult)."""
from __future__ import annotations

import json

import pytest

from pipelines.models import (
    Finding,
    GateResult,
    GateStatus,
    Severity,
    SeveritySummary,
    SubmissionResult,
    SubmissionStatus,
    determine_status,
)


# ── determine_status ──────────────────────────────────────────────────────────

@pytest.mark.parametrize("score,expected", [
    (0,  SubmissionStatus.APPROVED),
    (10, SubmissionStatus.APPROVED),
    (19, SubmissionStatus.APPROVED),
    (20, SubmissionStatus.MANUAL_REVIEW),
    (49, SubmissionStatus.MANUAL_REVIEW),
    (50, SubmissionStatus.MANUAL_REVIEW),
    (79, SubmissionStatus.MANUAL_REVIEW),
    (80, SubmissionStatus.REJECTED),
    (99, SubmissionStatus.REJECTED),
])
def test_determine_status(score, expected):
    assert determine_status(score) == expected


# ── SubmissionResult.to_dict ───────────────────────────────────────────────

def _make_result(score=0, status=SubmissionStatus.APPROVED) -> SubmissionResult:
    return SubmissionResult(
        submission_id="sub-001",
        developer_id="dev-1",
        plugin_name="my-plugin",
        plugin_version="1.0.0",
        status=status,
        anomaly_score=score,
        summary=SeveritySummary(),
        merkle_root="abc123",
        sig_bundle=None,
        gates=[],
    )


def test_submission_result_to_dict_keys():
    result = _make_result()
    d = result.to_dict()
    for key in ("submission_id", "developer_id", "plugin_name", "plugin_version",
                "status", "anomaly_score", "summary", "merkle_root", "gates"):
        assert key in d


def test_submission_result_to_dict_no_verified_zip():
    """verified_zip_path ne doit pas apparaître dans to_dict (retiré de l'export)."""
    result = _make_result()
    d = result.to_dict()
    assert "verified_zip_path" not in d


def test_submission_result_export_json(tmp_path):
    result = _make_result(score=15)
    out = tmp_path / "result.json"
    result.export_json(str(out))
    data = json.loads(out.read_text())
    assert data["anomaly_score"] == 15
    assert data["status"] == "approved"


# ── Finding ───────────────────────────────────────────────────────────────────

def test_finding_to_dict():
    f = Finding(
        message="import os détecté",
        severity=Severity.HIGH,
        file="main.py",
        line=42,
    )
    d = f.to_dict()
    assert d["message"] == "import os détecté"
    assert d["severity"] == "high"
    assert d["line"] == 42


# ── GateResult ────────────────────────────────────────────────────────────────

def test_gate_result_to_dict():
    gr = GateResult(
        gate="import_scan",
        status=GateStatus.PASSED,
        anomaly_score=0,
        findings=[],
        duration_seconds=0.12,
    )
    d = gr.to_dict()
    assert d["gate"] == "import_scan"
    assert d["status"] == "passed"
    assert d["anomaly_score"] == 0


def test_gate_result_blocked():
    gr = GateResult(
        gate="sig_check",
        status=GateStatus.BLOCKED,
        anomaly_score=80,
    )
    assert gr.status == GateStatus.BLOCKED


# ── SeveritySummary ───────────────────────────────────────────────────────────

def test_severity_summary_defaults():
    s = SeveritySummary()
    d = s.to_dict()
    assert d == {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
