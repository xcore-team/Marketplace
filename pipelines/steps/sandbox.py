"""Gate 5 — Sandbox (Validation de l'exécution selon le mode : sandboxed, trusted, legacy)."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import textwrap
import time
from pathlib import Path

from ..common import _run_async
from ..models import (
    SCORE_AUTO_REJECT,
    SCORE_MAP,
    Finding,
    GateResult,
    GateStatus,
    Severity,
    make_result,
)

logger = logging.getLogger("hub.marketplace.gates")

# ─────────────────────────────────────────────────────────────
#  Constants & Helpers
# ─────────────────────────────────────────────────────────────

_TRUSTED_SUSPICIOUS = [
    ("socket.", Severity.HIGH, "tentative connexion réseau"),
    ("urllib.request", Severity.HIGH, "tentative requête HTTP"),
    ("subprocess", Severity.CRITICAL, "tentative lancement sous-processus"),
    ("PermissionError", Severity.MEDIUM, "accès fichier refusé"),
]

_SANDBOX_SUSPICIOUS = {
    "socket": Severity.HIGH,
    "urllib": Severity.HIGH,
    "permission": Severity.MEDIUM,
    "network": Severity.HIGH,
    "connect": Severity.HIGH,
}


class _NullCtx:
    """Contexte minimal pour SandboxProcessManager hors du runtime xcore."""

    _events = None

    class _events:
        @staticmethod
        def emit_sync(*a, **k):
            pass


async def _gate5_legacy(
    manifest,
    source_dir: Path,
    timeout: int,
    findings: list[Finding],
) -> tuple[int, list[Finding]]:
    """Validation minimale pour les plugins au format Legacy."""
    import sys

    score = 0
    entry_path = source_dir / manifest.entry_point
    findings.append(
        Finding(
            "[LEGACY] Mode legacy détecté — validation minimale appliquée.",
            Severity.INFO,
        )
    )

    check_script = textwrap.dedent(f"""
        import sys, json, resource
        resource.setrlimit(resource.RLIMIT_AS, (256*1024*1024,)*2)
        import importlib.util
        try:
            spec = importlib.util.spec_from_file_location("plugin_legacy", {str(entry_path)!r})
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            print(json.dumps({{"status": "ok"}}))
        except Exception as e:
            print(json.dumps({{"status": "error", "msg": str(e)}}))
    """)

    rc, stdout, stderr = await _run_async(
        [sys.executable, "-c", check_script],
        timeout=timeout,
        cwd=str(source_dir),
    )

    if rc != 0:
        findings.append(
            Finding(f"[LEGACY] Crash au chargement (exit {rc})", Severity.MEDIUM)
        )
        score += SCORE_MAP[Severity.MEDIUM]
    else:
        try:
            out = json.loads(stdout.strip().split("\n")[-1])
            if out.get("status") != "ok":
                findings.append(
                    Finding(
                        f"[LEGACY] Erreur chargement : {out.get('msg', '?')}",
                        Severity.MEDIUM,
                    )
                )
                score += SCORE_MAP[Severity.MEDIUM]
        except json.JSONDecodeError:
            pass

    if "socket." in stderr or "urllib.request" in stderr:
        findings.append(Finding("[LEGACY] Activité réseau détectée", Severity.HIGH))
        score += SCORE_MAP[Severity.HIGH]

    return min(score, SCORE_AUTO_REJECT - 1), findings


async def _gate5_trusted(
    manifest,
    source_dir: Path,
    timeout: int,
    findings: list[Finding],
) -> tuple[int, list[Finding]]:
    """Validation pour les plugins Trusted (signature + chargement sans side-effects)."""
    import sys

    score = 0

    # 1. Signature HMAC
    try:
        from xcore.configurations.loader import ConfigLoader
        from xcore.kernel.security.signature import verify_plugin

        cfg = ConfigLoader.load()
        verify_plugin(manifest, cfg.plugins.secret_key)
        logger.info("[gate_5/trusted] Signature OK")
    except Exception as e:
        findings.append(
            Finding(f"[TRUSTED] Signature invalide ou absente : {e}", Severity.HIGH)
        )
        score += SCORE_MAP[Severity.HIGH]

    # 2. Chargement dans subprocess isolé
    entry_path = source_dir / manifest.entry_point
    check_script = textwrap.dedent(f"""
        import sys, json, resource
        resource.setrlimit(resource.RLIMIT_AS, (256*1024*1024,)*2)
        resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
        import importlib.util
        try:
            spec = importlib.util.spec_from_file_location("plugin_gate5", {str(entry_path)!r})
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            has_plugin_class = hasattr(mod, "Plugin")
            has_handle = callable(getattr(mod.Plugin, "handle", None))
            print(json.dumps({{
                "status": "ok",
                "has_plugin_class": has_plugin_class,
                "has_handle": has_handle,
            }}))
        except Exception as e:
            print(json.dumps({{"status": "error", "msg": str(e)}}))
    """)

    rc, stdout, stderr = await _run_async(
        [sys.executable, "-c", check_script],
        timeout=timeout,
        cwd=str(source_dir),
    )

    if rc != 0:
        findings.append(
            Finding(f"[TRUSTED] Subprocess exit {rc} : {stderr[:200]}", Severity.MEDIUM)
        )
        score += SCORE_MAP[Severity.MEDIUM]
    else:
        try:
            out = json.loads(stdout.strip().split("\n")[-1])
            if out.get("status") != "ok":
                findings.append(
                    Finding(
                        f"[TRUSTED] Erreur chargement : {out.get('msg')}", Severity.HIGH
                    )
                )
                score += SCORE_MAP[Severity.HIGH]
            if not out.get("has_plugin_class"):
                findings.append(
                    Finding("[TRUSTED] Classe Plugin() manquante", Severity.HIGH)
                )
                score += SCORE_MAP[Severity.HIGH]
            if not out.get("has_handle"):
                findings.append(
                    Finding("[TRUSTED] Méthode handle() manquante", Severity.HIGH)
                )
                score += SCORE_MAP[Severity.HIGH]
        except json.JSONDecodeError:
            findings.append(
                Finding(
                    f"[TRUSTED] Sortie inattendue : {stdout[:100]}", Severity.MEDIUM
                )
            )
            score += SCORE_MAP[Severity.MEDIUM]

    # 3. Comportements suspects
    for pattern, sev, label in _TRUSTED_SUSPICIOUS:
        if pattern.lower() in stderr.lower():
            findings.append(Finding(f"[TRUSTED] {label} détectée", sev))
            score += SCORE_MAP[sev]

    return score, findings


async def _gate5_sandboxed(
    manifest,
    source_dir: Path,
    timeout: int,
    findings: list[Finding],
) -> tuple[int, list[Finding]]:
    """Validation complète via SandboxProcessManager (worker.py)."""
    from xcore.kernel.sandbox.process_manager import (
        SandboxConfig,
        SandboxProcessManager,
    )

    score = 0
    config = SandboxConfig(
        timeout=float(timeout),
        max_restarts=0,
        startup_timeout=10.0,
    )
    mgr = SandboxProcessManager(manifest=manifest, ctx=_NullCtx())

    try:
        await asyncio.wait_for(mgr.start(), timeout=timeout)
        resp = await mgr._channel.call("ping", {})
        if not resp.success:
            findings.append(
                Finding(
                    f"[SANDBOX] Ping échoué : {resp.data.get('msg', '?')}",
                    Severity.MEDIUM,
                )
            )
            score += SCORE_MAP[Severity.MEDIUM]

        resp2 = await mgr._channel.call("health", {})
        if resp2.success:
            logger.info(f"[gate_5/sandboxed] health OK : {resp2.data}")

    except asyncio.TimeoutError:
        findings.append(
            Finding(f"[SANDBOX] Timeout démarrage ({timeout}s)", Severity.HIGH)
        )
        score += SCORE_MAP[Severity.HIGH]
    except Exception as e:
        err = str(e).lower()
        found_suspicious = False
        for s, sev in _SANDBOX_SUSPICIOUS.items():
            if s in err:
                findings.append(
                    Finding(f"[SANDBOX] Comportement suspect : '{s}' détecté", sev)
                )
                score += SCORE_MAP[sev]
                found_suspicious = True

        if not found_suspicious:
            findings.append(
                Finding(f"[SANDBOX] Erreur démarrage : {e}", Severity.MEDIUM)
            )
            score += SCORE_MAP[Severity.MEDIUM]
    finally:
        with contextlib.suppress(Exception):
            await mgr.stop()

    return score, findings


# ─────────────────────────────────────────────────────────────
#  Main Gate Function
# ─────────────────────────────────────────────────────────────


async def gate_5(
    source_dir: Path,
    timeout: int = 30,
) -> GateResult:
    """
    Gate 5 — Sandbox: Valide le comportement du plugin en fonction de son mode d'exécution.
    """
    started = time.time()
    findings: list[Finding] = []
    score = 0

    try:
        from xcore.kernel.security.validation import ManifestValidator

        manifest, _, _ = ManifestValidator().load_and_validate(source_dir)
    except Exception as e:
        findings.append(Finding(f"[GATE_5] Manifeste invalide : {e}", Severity.HIGH))
        return make_result(
            "gate_5_sandbox",
            GateStatus.FAILED,
            SCORE_MAP[Severity.HIGH],
            findings,
            started,
        )

    mode = manifest.execution_mode.value
    logger.info(f"[gate_5] Plugin '{manifest.name}' mode={mode}")

    if mode == "sandboxed":
        score, findings = await _gate5_sandboxed(
            manifest, source_dir, timeout, findings
        )
    elif mode == "trusted":
        score, findings = await _gate5_trusted(manifest, source_dir, timeout, findings)
    elif mode == "legacy":
        score, findings = await _gate5_legacy(manifest, source_dir, timeout, findings)
    else:
        findings.append(Finding(f"[GATE_5] Mode inconnu : {mode}", Severity.MEDIUM))
        score = SCORE_MAP[Severity.MEDIUM]

    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )

    logger.info(f"[gate_5] '{manifest.name}' [{mode}] → {status.value} (score={score})")
    return make_result("gate_5_sandbox", status, score, findings, started)
