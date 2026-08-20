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
    findings.append(
        Finding(
            "Mode legacy détecté — validation minimale appliquée",
            Severity.INFO,
        )
    )

    entry_point_str = str(manifest.entry_point).replace("\\", "/")
    module_name = entry_point_str.removesuffix(".py").replace("/", ".")

    check_script = textwrap.dedent(f"""
        import sys, json, importlib
        sys.path.insert(0, {str(source_dir)!r})
        try:
            import resource
            resource.setrlimit(resource.RLIMIT_AS, (256*1024*1024,)*2)
        except Exception:
            pass
        try:
            importlib.import_module({module_name!r})
            print(json.dumps({{"status": "ok"}}))
        except Exception as e:
            print(json.dumps({{"status": "error", "msg": str(e)}}))
    """)

    rc, stdout, stderr = await _run_async(
        [sys.executable, "-c", check_script],
        timeout=timeout,
        cwd=str(source_dir),
    )

    if rc == -1:
        findings.append(
            Finding(
                f"Timeout au chargement du plugin (>{timeout}s)",
                Severity.MEDIUM,
                remediation="Le plugin met trop de temps à s'initialiser. Évitez les opérations bloquantes au niveau module.",
            )
        )
        score += SCORE_MAP[Severity.MEDIUM]
    elif rc != 0:
        stderr_detail = stderr.strip()[:300] if stderr.strip() else "(aucune sortie)"
        findings.append(
            Finding(
                f"Crash au chargement du plugin (exit code {rc})",
                Severity.MEDIUM,
                code=stderr_detail,
                remediation="Corrigez l'erreur d'import ou d'initialisation. Testez localement avec `python -c \"import votre_module\"`",
            )
        )
        score += SCORE_MAP[Severity.MEDIUM]
    else:
        try:
            out = json.loads(stdout.strip().split("\n")[-1])
            if out.get("status") != "ok":
                findings.append(
                    Finding(
                        f"Erreur lors du chargement : {out.get('msg', '?')}",
                        Severity.MEDIUM,
                        remediation="Corrigez l'exception levée à l'import du plugin.",
                    )
                )
                score += SCORE_MAP[Severity.MEDIUM]
        except json.JSONDecodeError:
            pass

    if "socket." in stderr or "urllib.request" in stderr:
        findings.append(
            Finding(
                "Activité réseau détectée pendant le chargement",
                Severity.HIGH,
                code="\n".join(l for l in stderr.splitlines() if "socket" in l or "urllib" in l)[:200],
                remediation="Un plugin ne doit pas établir de connexion réseau lors de son initialisation.",
            )
        )
        score += SCORE_MAP[Severity.HIGH]

    return min(score, SCORE_AUTO_REJECT - 1), findings


async def _gate5_trusted(
    manifest,
    source_dir: Path,
    timeout: int,
    findings: list[Finding],
) -> tuple[int, list[Finding]]:
    """
    Validation pour les plugins Trusted via analyse AST statique.

    On n'exécute PAS le plugin (ses dépendances ne sont pas forcément installées
    et xcore peut tenter de connecter DB/Redis à l'import).
    On inspecte l'AST de l'entry_point pour vérifier la structure attendue,
    puis on scanne tout le code pour des patterns comportementaux suspects.
    """
    import ast as _ast

    score = 0
    entry_point_str = str(manifest.entry_point).replace("\\", "/")
    entry_path = source_dir / entry_point_str

    # ── 1. Vérification structurelle via AST ─────────────────────────────────
    if not entry_path.exists():
        findings.append(
            Finding(
                f"Entry point introuvable : `{entry_point_str}`",
                Severity.HIGH,
                remediation=(
                    f"Le champ `entry_point` dans plugin.yaml pointe vers `{entry_point_str}` "
                    "qui n'existe pas dans le ZIP."
                ),
            )
        )
        return SCORE_MAP[Severity.HIGH], findings

    try:
        source = entry_path.read_text(encoding="utf-8", errors="ignore")
        tree = _ast.parse(source, filename=entry_point_str)
    except SyntaxError as e:
        findings.append(
            Finding(
                f"Erreur de syntaxe dans `{entry_point_str}` (ligne {e.lineno}) : {e.msg}",
                Severity.HIGH,
                file=entry_point_str,
                line=e.lineno,
                remediation="Corrigez l'erreur de syntaxe avant de soumettre.",
            )
        )
        return SCORE_MAP[Severity.HIGH], findings

    lines = source.splitlines()

    # Cherche la classe Plugin dans l'AST
    plugin_class_node = None
    for node in _ast.walk(tree):
        if isinstance(node, _ast.ClassDef) and node.name == "Plugin":
            plugin_class_node = node
            break

    if plugin_class_node is None:
        findings.append(
            Finding(
                f"Classe `Plugin` introuvable dans `{entry_point_str}`",
                Severity.HIGH,
                file=entry_point_str,
                remediation=(
                    "Définissez une classe `Plugin` dans votre entry_point :\n"
                    "  from xcore.sdk import TrustedBase\n"
                    "  class Plugin(TrustedBase):\n"
                    "      async def on_load(self): ..."
                ),
            )
        )
        score += SCORE_MAP[Severity.HIGH]
    else:
        # Vérifie on_load ou handle
        method_names = {
            n.name for n in _ast.walk(plugin_class_node)
            if isinstance(n, (_ast.FunctionDef, _ast.AsyncFunctionDef))
        }
        xcore_methods = {"on_load", "on_unload", "get_router", "handle"}
        found_methods = method_names & xcore_methods

        if not found_methods:
            findings.append(
                Finding(
                    f"Aucune méthode XCore (`on_load`, `get_router`, `handle`) dans la classe `Plugin`",
                    Severity.HIGH,
                    file=entry_point_str,
                    line=plugin_class_node.lineno,
                    code=f"Méthodes trouvées : {sorted(method_names) or '[]'}",
                    remediation=(
                        "Votre classe Plugin doit implémenter au moins `async def on_load(self): ...`"
                    ),
                )
            )
            score += SCORE_MAP[Severity.HIGH]
        else:
            logger.info(f"[gate_5] Plugin class OK — méthodes : {found_methods}")

    # ── 2. Scan comportemental via AST (imports directs uniquement) ──────────
    # On utilise l'AST, pas du texte, pour éviter les faux positifs sur les
    # commentaires, docstrings, noms de variables, imports indirects (LangChain…).
    _SUSPICIOUS_IMPORTS = {
        # module → (severity, description)
        "subprocess": (Severity.HIGH, "exécution de sous-processus"),
        "socket":     (Severity.HIGH, "connexion réseau directe (socket)"),
        "pty":        (Severity.HIGH, "pseudo-terminal (risque élévation)"),
        "ctypes":     (Severity.HIGH, "appels natifs C/DLL"),
        "cffi":       (Severity.MEDIUM, "appels natifs C (cffi)"),
    }

    suspicious_imports: dict[str, list[tuple[str, int, str]]] = {}
    for py in source_dir.rglob("*.py"):
        rel = str(py.relative_to(source_dir))
        try:
            content = py.read_text(encoding="utf-8", errors="ignore")
            py_lines = content.splitlines()
            tree_beh = _ast.parse(content)
            for node in _ast.walk(tree_beh):
                if not isinstance(node, (_ast.Import, _ast.ImportFrom)):
                    continue
                if isinstance(node, _ast.Import):
                    names = [a.name.split(".")[0] for a in node.names]
                else:
                    names = [node.module.split(".")[0]] if node.module else []
                for n in names:
                    if n in _SUSPICIOUS_IMPORTS:
                        line_src = py_lines[node.lineno - 1].strip() if 0 < node.lineno <= len(py_lines) else ""
                        suspicious_imports.setdefault(n, []).append((rel, node.lineno, line_src))
        except Exception:
            pass

    for mod, occurrences in suspicious_imports.items():
        sev, desc = _SUSPICIOUS_IMPORTS[mod]
        sample = "\n".join(f"  {r}:{ln}  {src}" for r, ln, src in occurrences[:4])
        findings.append(
            Finding(
                f"Import direct de `{mod}` ({desc}) — {len(occurrences)} occurrence(s)",
                sev,
                code=sample,
                remediation=(
                    f"Le module `{mod}` permet {desc}. "
                    "Déclarez la permission correspondante dans plugin.yaml si c'est intentionnel, "
                    "ou supprimez cet import si non nécessaire."
                ),
            )
        )
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
        from ..common import _ensure_dotenv
        from xcore.kernel.security.validation import ManifestValidator

        _ensure_dotenv(source_dir)
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
