"""sandbox/runner.py — Exécution d'un plugin avec limites mémoire et CPU."""

from __future__ import annotations

import asyncio
import json
import logging
import resource
import sys
import textwrap
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger("hub.marketplace.sandbox")


@dataclass
class SandboxLimits:
    memory_mb: int = 128  # Limite mémoire virtuelle (RLIMIT_AS)
    cpu_seconds: int = 10  # Limite CPU (RLIMIT_CPU)
    max_open_files: int = 64  # Limite descripteurs fichiers (RLIMIT_NOFILE)
    timeout: int = 30  # Timeout global du subprocess (secondes)


@dataclass
class SandboxRunResult:
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    timed_out: bool = False


class SandboxRunner:
    """
    Lance un script Python dans un subprocess isolé avec des limites
    de ressources appliquées via resource.setrlimit (POSIX uniquement).

    Usage:
        runner = SandboxRunner(limits=SandboxLimits(memory_mb=256, cpu_seconds=15))
        result = await runner.run_check(source_dir, entry_point)
    """

    def __init__(self, limits: SandboxLimits | None = None):
        self.limits = limits or SandboxLimits()

    async def run_check(self, source_dir: Path, entry_point: str) -> SandboxRunResult:
        """
        Charge le plugin entry_point dans un subprocess isolé et vérifie
        qu'il expose une classe Plugin avec une méthode handle().
        """
        entry_path = source_dir / entry_point
        script = self._build_check_script(entry_path)

        cmd = [sys.executable, "-c", script]
        return await self._run(cmd, cwd=str(source_dir))

    # ─── internals ──────────────────────────────────────────────────────────

    def _build_check_script(self, entry_path: Path) -> str:
        mem_bytes = self.limits.memory_mb * 1024 * 1024
        cpu_sec = self.limits.cpu_seconds
        max_files = self.limits.max_open_files

        return textwrap.dedent(f"""
            import resource, json, importlib.util

            resource.setrlimit(resource.RLIMIT_AS,    ({mem_bytes}, {mem_bytes}))
            resource.setrlimit(resource.RLIMIT_CPU,   ({cpu_sec},   {cpu_sec}))
            resource.setrlimit(resource.RLIMIT_NOFILE,({max_files}, {max_files}))

            try:
                spec = importlib.util.spec_from_file_location("_plugin", {str(entry_path)!r})
                mod  = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)
                has_class  = hasattr(mod, "Plugin")
                has_handle = callable(getattr(getattr(mod, "Plugin", None), "handle", None))
                print(json.dumps({{
                    "status": "ok",
                    "has_plugin_class": has_class,
                    "has_handle": has_handle,
                }}))
            except Exception as e:
                print(json.dumps({{"status": "error", "msg": str(e)}}))
        """)

    async def _run(self, cmd: list[str], cwd: str) -> SandboxRunResult:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
        )
        try:
            stdout_b, stderr_b = await asyncio.wait_for(
                proc.communicate(), timeout=self.limits.timeout
            )
            return SandboxRunResult(
                success=proc.returncode == 0,
                exit_code=proc.returncode,
                stdout=stdout_b.decode("utf-8", errors="replace"),
                stderr=stderr_b.decode("utf-8", errors="replace"),
            )
        except asyncio.TimeoutError:
            proc.kill()
            return SandboxRunResult(
                success=False,
                exit_code=-1,
                stdout="",
                stderr=f"Timeout après {self.limits.timeout}s",
                timed_out=True,
            )
