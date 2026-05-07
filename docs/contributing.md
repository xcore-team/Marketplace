# Contributing Guide

Welcome! This guide explains how to extend the Gates Security Pipeline.

## Adding a New Gate

To add a new analysis module (e.g., `gate_10`):

1.  **Create the Module**: Add a new file in `gates/steps/your_gate.py`.
2.  **Implement the Logic**:
    ```python
    import time
    from ..models import GateResult, GateStatus, make_result, Finding, Severity

    async def gate_10(source_dir: Path) -> GateResult:
        started = time.time()
        findings = []
        # ... your analysis logic here ...
        # Use make_result helper to return the data
        return make_result("gate_10_name", GateStatus.PASSED, 0, findings, started)
    ```
3.  **Register with Orchestrator**: Update `gates/orchestrator.py` to import and include your gate in the `parallel_gates` task list.

## Development Standards

### 1. Asynchronous Execution
Always use `async/await`. If you need to run a CPU-bound task or a blocking subprocess, use `asyncio.to_thread` or `asyncio.create_subprocess_exec`.

### 2. Result Consistency
Never return raw dicts. Always use the `GateResult` and `Finding` dataclasses from `gates/models.py`.

### 3. Error Handling
Gates should be resilient. Wrap your analysis logic in a `try/except` block and return a `GateResult` with a `FAILED` status if necessary, rather than letting an exception crash the entire pipeline.

### 4. Code Style
We use:
- **Ruff**: For linting and formatting.
- **Mypy**: For static type checking.

Before submitting a PR, ensure your code passes these checks:
```bash
uv run ruff check .
uv run mypy .
```

## Testing

*Note: The test suite is currently under development.* 

When adding a new gate, please include a `tests/` directory with unit tests demonstrating:
- The gate passing on clean code.
- The gate correctly identifying specific vulnerabilities and assigning the expected severity.
