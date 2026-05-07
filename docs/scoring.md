# Scoring & Decision Logic

The pipeline uses a risk-based scoring system to determine the fate of a plugin submission.

## Severity Levels

Every finding in a gate is assigned a severity level, which carries a specific weight in the total score:

| Severity | Score | Description |
| :--- | :--- | :--- |
| `CRITICAL` | 80 | Immediate threat (e.g., active backdoor, plain-text private key). |
| `HIGH` | 40 | Major vulnerability or violation (e.g., SQL Injection, unlicensed copy-paste). |
| `MEDIUM` | 20 | Moderate risk (e.g., usage of `eval`, dependency confusion risk). |
| `LOW` | 5 | Minor issue or best practice violation. |
| `INFO` | 0 | Purely informational finding. |

## Status Determination

The total anomaly score (sum of all findings across all gates) determines the final status:

| Total Score | Status | Action |
| :--- | :--- | :--- |
| **0 - 19** | `APPROVED` | Automatically approved for marketplace listing. |
| **20 - 79** | `MANUAL_REVIEW` | Held for a human moderator to investigate. |
| **80+** | `REJECTED` | Automatically rejected; the developer must fix and resubmit. |

## Threshold Configuration

These thresholds are defined in `gates/models.py`:

```python
SCORE_AUTO_APPROVE = 20
SCORE_HIGH_PRIORITY = 50
SCORE_AUTO_REJECT = 80
```

## Special Cases

### Intake Block
If `gate_1` (Intake) detects a score ≥ 80, the orchestrator returns a `REJECTED` status immediately and does not run any other gates.

### Timeout & Errors
If a gate fails due to an exception or timeout, it is logged, but the pipeline continues. The `SubmissionResult` will contain the error details if a fatal pipeline-wide error occurs.
