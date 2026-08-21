# Contributing Guide

Welcome! This guide explains how to extend the submission pipeline.

## Adding a New Gate

To add a new analysis module (there are 11 today — see
[gates.md](gates.md) — so a new one would be `gate_12`):

1.  **Create the module**: add a new file in `pipelines/steps/your_gate.py`.
2.  **Implement the logic**:
    ```python
    import time
    from ..models import GateResult, GateStatus, make_result, Finding, Severity

    async def gate_12(source_dir: Path) -> GateResult:
        started = time.time()
        findings: list[Finding] = []
        # ... your analysis logic here ...
        return make_result("gate_12_name", GateStatus.PASSED, 0, findings, started)
    ```
3.  **Register with the orchestrator**: import it in
    `pipelines/orchestrator.py` and add it to the `tasks` list built inside
    `PipelineOrchestrator.run_all()` (the gates run concurrently via
    `asyncio.gather`, so ordering in that list doesn't matter for timing —
    only for the order results are appended to `SubmissionResult.gates`).
    If the gate is relevant to `xservices` submissions too, also wire it
    into `pipelines/service_orchestrator.py`.
4.  **Extra return values**: if your gate needs to hand back something
    beyond a `GateResult` (like gate 7/signing returning `merkle_root` +
    `sig_bundle`), return a tuple and handle it explicitly in
    `PipelineOrchestrator.run_all()`'s result-unpacking loop — see how gate 7
    is special-cased there today.

## Development Standards

### 1. Asynchronous Execution
Always use `async/await`. If you need to run a CPU-bound task or a blocking
subprocess, use `asyncio.to_thread` or the existing `_run`/`_run_async`
helpers in `pipelines/common.py` rather than a bare `subprocess.run`.

### 2. Result Consistency
Never return raw dicts. Always use the `GateResult` and `Finding` dataclasses
from `pipelines/models.py`, and build results via the `make_result` helper
so `duration_seconds` is computed consistently.

### 3. Error Handling
Gates should be resilient. Wrap your analysis logic in a `try/except` block
and return a `GateResult` with a `FAILED` status if necessary. If a gate
raises anyway, the orchestrator catches it at the `asyncio.gather` boundary,
logs it, and drops that gate's contribution rather than crashing the whole
pipeline — but that gate's checks simply don't run for that submission, so
prefer returning a `FAILED` result over letting an exception escape.

### 4. The `.env` stub
If your gate needs to import or execute the submitted plugin's code, be
aware of `pipelines/common.py::_ensure_dotenv` — it only fires for plugins
declaring `envconfiguration.inject: true`, and only mocks variables the
manifest's `env:` section actually declares. Don't assume arbitrary
environment variables are populated; add mock rules to `_ENV_MOCK_RULES` if
your gate's target code commonly needs a new kind of variable to boot.

### 5. Code Style
We use:
- **Ruff**: for linting and formatting.
- **Mypy**: for static type checking.

Before submitting a PR, ensure your code passes these checks:
```bash
uv run ruff check .
uv run mypy .
```

## Testing

Tests use in-memory SQLite (`tests/conftest.py` wires an async engine per
test, no external DB needed) and `pytest-asyncio` in auto mode:

```bash
uv run pytest
uv run pytest tests/test_pipeline_models.py   # single test file
```

When adding a new gate, include tests demonstrating:
- The gate passing on clean code.
- The gate correctly identifying specific vulnerabilities and assigning the
  expected severity.
