"""
hub-marketplace/src/gates/common.py
====================================
Helpers communs partagés entre les différentes gates.
"""

from __future__ import annotations

import asyncio
import logging
import subprocess
from pathlib import Path

logger = logging.getLogger("hub.marketplace.gates")


def _run(cmd: list[str], timeout: int = 60) -> tuple[int, str, str]:
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired:
        return 124, "", f"Timeout {timeout}s"
    except FileNotFoundError as e:
        return 1, "", f"Outil absent : {e}"
    except Exception as e:
        return 1, "", str(e)


async def _run_async(
    cmd: list[str],
    timeout: int,
    cwd: str | None = None,
) -> tuple[int, str, str]:
    """Lance un subprocess async et retourne (returncode, stdout, stderr)."""
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=cwd,
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return (
            proc.returncode,
            stdout.decode("utf-8", errors="replace"),
            stderr.decode("utf-8", errors="replace"),
        )
    except asyncio.TimeoutError:
        proc.kill()
        return -1, "", f"Timeout après {timeout}s"
    except Exception as e:
        return 1, "", str(e)


def _xcore_manifest(source_dir: Path):
    try:
        from xcore.kernel.security.validation import ManifestValidator

        manifest, _, _ = ManifestValidator().load_and_validate(source_dir)
        return manifest
    except Exception:
        return None


class Tracer:
    """Lightweight tracing helper (OpenTelemetry ready)."""

    def __init__(self, name: str):
        self.name = name
        try:
            from opentelemetry import trace
            self.tracer = trace.get_tracer(name)
        except ImportError:
            self.tracer = None

    def start_span(self, span_name: str):
        if self.tracer:
            return self.tracer.start_as_current_span(span_name)
        
        # Fallback to a dummy context manager if OTel is missing
        class DummySpan:
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def set_attribute(self, key, value): pass
        
        return DummySpan()

tracer = Tracer("hub.marketplace.gates")
