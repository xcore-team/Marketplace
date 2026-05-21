"""Gate 11 — Sandbox d'exécution : détection des commandes shell/système.

Deux passes complémentaires :

  Passe 1 — Analyse AST statique
    Cherche toute invocation de subprocess / os.system / os.popen / os.exec* /
    shlex.split() → subprocess dans tous les fichiers .py.
    Extrait les arguments de commande si ce sont des literals.
    Croissé avec allowed_imports du plugin.yaml :
      • Module présent dans allowed_imports  → LOW  (avertissement, usage déclaré)
      • Module absent  des allowed_imports   → HIGH (usage non déclaré = suspect)
      • Argument contient patterns dangereux  → CRITICAL (rm -rf, wget, curl|bash…)

  Passe 2 — Exécution sandbox (best-effort)
    Lance l'entry_point dans un subprocess Python isolé avec :
      • Monkey-patching de os.system, subprocess.run/call/Popen, os.popen, os.exec*
      • sys.path enrichi du répertoire source
      • Timeout stricte (10 s)
    Toute tentative d'appel shell interceptée est remontée comme finding.
    Si le plugin ne peut pas être importé (dépendances manquantes) la passe est
    ignorée sans pénalité — seule la passe AST compte.
"""

from __future__ import annotations

import ast as _ast
import json
import logging
import sys
import textwrap
import time
from pathlib import Path

from ..common import _run_async, _xcore_manifest
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

# ── Patterns de commandes intrinsèquement dangereuses ────────────────────────
# Si un argument literal d'une commande correspond à l'un de ces patterns,
# le score passe directement à CRITICAL indépendamment des allowed_imports.
_DANGEROUS_CMD_PATTERNS: list[tuple[str, str]] = [
    ("rm ",          "suppression de fichiers (rm)"),
    ("rm\t",         "suppression de fichiers (rm)"),
    ("shred",        "effacement sécurisé (shred)"),
    ("dd if=",       "copie bas-niveau (dd)"),
    ("wget ",        "téléchargement via wget"),
    ("curl ",        "téléchargement/exfiltration via curl"),
    ("|bash",        "pipe vers bash (RCE)"),
    ("| bash",       "pipe vers bash (RCE)"),
    ("|sh",          "pipe vers sh (RCE)"),
    ("| sh",         "pipe vers sh (RCE)"),
    (">/dev/tcp",    "redirection vers TCP (exfiltration)"),
    ("nc ",          "netcat (connexion réseau brute)"),
    ("ncat ",        "ncat (connexion réseau brute)"),
    ("chmod 777",    "permissions dangereuses"),
    ("chmod +s",     "setuid (élévation de privilèges)"),
    ("crontab",      "modification du crontab"),
    ("chown root",   "changement propriétaire root"),
    ("mkfifo",       "création de FIFO (communication covert)"),
    ("base64 -d",    "décodage base64 (payload obfusqué)"),
    ("python -c",    "exécution Python inline"),
    ("python3 -c",   "exécution Python inline"),
    ("eval ",        "eval shell"),
    ("/etc/passwd",  "accès au fichier passwd"),
    ("/etc/shadow",  "accès au fichier shadow"),
    ("id_rsa",       "accès à une clé SSH privée"),
]

# Fonctions shell à surveiller (module → liste d'attributs)
_SHELL_SINKS: dict[str | None, set[str]] = {
    "subprocess": {"run", "call", "check_output", "check_call", "Popen", "getoutput", "getstatusoutput"},
    "os":         {"system", "popen", "popen2", "popen3", "popen4",
                   "execve", "execvp", "execvpe", "execl", "execle", "execlp", "execlpe"},
    "shlex":      {"split"},  # souvent précurseur d'un subprocess
    None:         {"system"},  # import direct de os.system via from os import system
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_allowed_imports(source_dir: Path) -> set[str]:
    """Retourne l'ensemble des modules déclarés dans allowed_imports du plugin.yaml."""
    manifest = _xcore_manifest(source_dir)
    if manifest is None:
        return set()
    raw = getattr(manifest, "allowed_imports", None) or []
    return {entry.split(".")[0].lower() for entry in raw if isinstance(entry, str)}


def _extract_cmd_args(node: _ast.Call, source_lines: list[str]) -> tuple[str | None, bool]:
    """
    Essaie d'extraire la commande (premier argument) d'un appel shell.
    Retourne (cmd_str | None, is_dynamic).
    """
    if not node.args:
        return None, True

    first = node.args[0]

    # Liste de strings literals → jointure
    if isinstance(first, _ast.List):
        parts = []
        for elt in first.elts:
            if isinstance(elt, _ast.Constant) and isinstance(elt.value, str):
                parts.append(elt.value)
            else:
                return None, True  # arg dynamique dans la liste
        return " ".join(parts), False

    # String literal directe
    if isinstance(first, _ast.Constant) and isinstance(first.value, str):
        return first.value, False

    return None, True


def _check_dangerous_cmd(cmd: str) -> list[str]:
    """Retourne la liste des patterns dangereux trouvés dans la commande."""
    cmd_lower = cmd.lower()
    return [desc for pat, desc in _DANGEROUS_CMD_PATTERNS if pat in cmd_lower]


# ── Passe 1 : analyse AST ─────────────────────────────────────────────────────

def _ast_scan(source_dir: Path, allowed_imports: set[str]) -> tuple[list[Finding], int]:
    findings: list[Finding] = []
    score = 0

    for py in source_dir.rglob("*.py"):
        rel = str(py.relative_to(source_dir))
        try:
            content = py.read_text(encoding="utf-8", errors="ignore")
            lines = content.splitlines()
            tree = _ast.parse(content)
        except Exception:
            continue

        # Résolution des alias d'import pour ce fichier
        # {alias_or_name → module_root}
        alias_map: dict[str, str] = {}
        for node in _ast.walk(tree):
            if isinstance(node, _ast.Import):
                for alias in node.names:
                    root = alias.name.split(".")[0]
                    if root in _SHELL_SINKS:
                        alias_map[alias.asname or root] = root
            elif isinstance(node, _ast.ImportFrom):
                mod_root = (node.module or "").split(".")[0]
                if mod_root in _SHELL_SINKS:
                    for alias in node.names:
                        name = alias.name
                        effective = alias.asname or name
                        # from subprocess import Popen → alias_map["Popen"] = "subprocess"
                        if name in (_SHELL_SINKS.get(mod_root) or set()):
                            alias_map[effective] = mod_root

        for node in _ast.walk(tree):
            if not isinstance(node, _ast.Call):
                continue

            func = node.func
            mod_root: str | None = None
            attr_name: str = ""

            if isinstance(func, _ast.Attribute):
                if isinstance(func.value, _ast.Name):
                    mod_root = alias_map.get(func.value.id, func.value.id)
                attr_name = func.attr
            elif isinstance(func, _ast.Name):
                # Appel direct : system("cmd") après from os import system
                if func.id in alias_map:
                    mod_root = alias_map[func.id]
                    attr_name = func.id
                else:
                    continue

            # Vérifie si c'est un sink connu
            sinks_for_mod = _SHELL_SINKS.get(mod_root, set())
            if attr_name not in sinks_for_mod:
                continue

            line_src = lines[node.lineno - 1].strip() if 0 < node.lineno <= len(lines) else ""
            cmd_str, is_dynamic = _extract_cmd_args(node, lines)
            call_repr = f"{mod_root}.{attr_name}()" if mod_root else f"{attr_name}()"

            # ── Patterns dangereux (priorité maximale) ────────────────────
            if cmd_str:
                dangers = _check_dangerous_cmd(cmd_str)
                if dangers:
                    danger_str = " / ".join(dangers)
                    findings.append(
                        Finding(
                            message=f"Commande shell DANGEREUSE détectée : {call_repr} — {danger_str}",
                            severity=Severity.CRITICAL,
                            file=rel,
                            line=node.lineno,
                            code=f"{line_src}\n  → cmd: {cmd_str[:120]}",
                            remediation=(
                                f"La commande `{cmd_str[:60]}` contient un pattern dangereux "
                                f"({danger_str}). "
                                "Supprimez cette invocation ou justifiez son usage impératif "
                                "avec une description détaillée dans plugin.yaml."
                            ),
                        )
                    )
                    score += SCORE_MAP[Severity.CRITICAL]
                    continue

            # ── Module déclaré dans allowed_imports ───────────────────────
            mod_normalized = (mod_root or "").lower()
            if mod_normalized in allowed_imports:
                cmd_info = f" → cmd: {cmd_str[:80]}" if cmd_str else (" → cmd dynamique" if is_dynamic else "")
                findings.append(
                    Finding(
                        message=(
                            f"Appel shell via `{call_repr}` "
                            f"(module `{mod_root}` déclaré dans allowed_imports)"
                        ),
                        severity=Severity.LOW,
                        file=rel,
                        line=node.lineno,
                        code=f"{line_src}{cmd_info}",
                        remediation=(
                            "Le module est déclaré — vérifiez que la commande est nécessaire "
                            "et ne traite pas d'entrées utilisateur non validées."
                        ),
                    )
                )
                score += SCORE_MAP[Severity.LOW]
            else:
                # ── Module NON déclaré → suspect ──────────────────────────
                cmd_info = f" → cmd: {cmd_str[:80]}" if cmd_str else (" → cmd dynamique" if is_dynamic else "")
                findings.append(
                    Finding(
                        message=(
                            f"Appel shell non déclaré : `{call_repr}` "
                            f"(module `{mod_root}` absent de allowed_imports)"
                        ),
                        severity=Severity.HIGH,
                        file=rel,
                        line=node.lineno,
                        code=f"{line_src}{cmd_info}",
                        remediation=(
                            f"Le module `{mod_root}` n'est pas dans `allowed_imports` de plugin.yaml. "
                            "Soit ajoutez-le avec une justification claire, soit supprimez "
                            "cet appel shell si non nécessaire."
                        ),
                    )
                )
                score += SCORE_MAP[Severity.HIGH]

    return findings, score


# ── Passe 2 : sandbox d'exécution ─────────────────────────────────────────────

_SANDBOX_SCRIPT = textwrap.dedent("""\
import sys, json, os, traceback

_intercepted = []

# ── Monkey-patch os ────────────────────────────────────────────────────────
_orig_system = os.system
_orig_popen  = os.popen

def _trap_system(cmd, *a, **kw):
    _intercepted.append({{"type": "os.system", "cmd": str(cmd)[:300]}})
    return 0  # ne pas exécuter la vraie commande

def _trap_popen(cmd, *a, **kw):
    _intercepted.append({{"type": "os.popen", "cmd": str(cmd)[:300]}})
    import io
    return io.StringIO("")

os.system = _trap_system
os.popen  = _trap_popen

# ── Monkey-patch subprocess ────────────────────────────────────────────────
import subprocess as _sp
_orig_run   = _sp.run
_orig_call  = _sp.call
_orig_Popen = _sp.Popen

def _trap_run(args, *a, **kw):
    _intercepted.append({{"type": "subprocess.run", "cmd": str(args)[:300]}})
    return _sp.CompletedProcess(args, 0, stdout=b"", stderr=b"")

def _trap_call(args, *a, **kw):
    _intercepted.append({{"type": "subprocess.call", "cmd": str(args)[:300]}})
    return 0

class _TrapPopen:
    def __init__(self, args, *a, **kw):
        _intercepted.append({{"type": "subprocess.Popen", "cmd": str(args)[:300]}})
        self.pid = -1; self.returncode = 0
        self.stdin = self.stdout = self.stderr = None
    def communicate(self, *a, **kw): return b"", b""
    def wait(self, *a, **kw): return 0
    def poll(self): return 0
    def __enter__(self): return self
    def __exit__(self, *a): pass

_sp.run   = _trap_run
_sp.call  = _trap_call
_sp.Popen = _TrapPopen

# ── Patch os.exec* ─────────────────────────────────────────────────────────
for _fn in ("execve","execvp","execvpe","execl","execle","execlp","execlpe"):
    if hasattr(os, _fn):
        def _make_trap(name):
            def _trap(*a, **kw):
                _intercepted.append({{"type": f"os.{{name}}", "cmd": str(a)[:300]}})
            return _trap
        setattr(os, _fn, _make_trap(_fn))

# ── Tentative d'import du plugin ───────────────────────────────────────────
sys.path.insert(0, {plugin_dir!r})
_entry = {entry_module!r}

try:
    import importlib
    importlib.import_module(_entry)
    result = {{"status": "ok", "intercepted": _intercepted}}
except ImportError as e:
    result = {{"status": "import_error", "msg": str(e), "intercepted": _intercepted}}
except Exception as e:
    result = {{"status": "error", "msg": str(e), "intercepted": _intercepted}}

print(json.dumps(result))
""")


async def _runtime_scan(
    source_dir: Path,
    manifest,
    timeout: int = 12,
) -> tuple[list[Finding], int]:
    """
    Lance le sandbox d'exécution.
    Retourne (findings, score). En cas d'échec de lancement, retourne ([], 0).
    """
    findings: list[Finding] = []
    score = 0

    entry_point_str = str(getattr(manifest, "entry_point", "src/main.py")).replace("\\", "/")
    entry_module = entry_point_str.removesuffix(".py").replace("/", ".")

    script = _SANDBOX_SCRIPT.format(
        plugin_dir=str(source_dir),
        entry_module=entry_module,
    )

    rc, stdout, stderr = await _run_async(
        [sys.executable, "-c", script],
        timeout=timeout,
        cwd=str(source_dir),
    )

    if rc == -1:
        # Timeout — lui-même suspect si le plugin ne devrait pas bloquer
        findings.append(
            Finding(
                message=f"[SANDBOX] Timeout à l'import du plugin (>{timeout}s)",
                severity=Severity.MEDIUM,
                remediation=(
                    "Le plugin bloque pendant son initialisation. "
                    "Évitez les opérations longues au niveau module (connexions DB, boucles, I/O)."
                ),
            )
        )
        score += SCORE_MAP[Severity.MEDIUM]
        return findings, score

    # Parse le résultat JSON
    try:
        last_line = stdout.strip().split("\n")[-1] if stdout.strip() else "{}"
        result = json.loads(last_line)
    except (json.JSONDecodeError, IndexError):
        logger.debug("[gate_11/sandbox] stdout non-JSON : %r", stdout[:200])
        return findings, score  # pas de résultat utilisable, ignore

    status = result.get("status", "")
    intercepted: list[dict] = result.get("intercepted", [])

    if status == "import_error":
        # Import échoué (dépendances xcore manquantes) — normal en pipeline
        logger.info(
            "[gate_11/sandbox] Import plugin échoué (dépendances) : %s — passe AST seule",
            result.get("msg", "?")[:100],
        )
        return findings, score

    # ── Commandes interceptées à l'exécution ─────────────────────────────────
    for intercept in intercepted:
        cmd_type = intercept.get("type", "?")
        cmd_str = intercept.get("cmd", "?")

        dangers = _check_dangerous_cmd(cmd_str)
        if dangers:
            danger_str = " / ".join(dangers)
            findings.append(
                Finding(
                    message=f"[RUNTIME] Commande dangereuse interceptée : {cmd_type}({cmd_str[:80]!r}) — {danger_str}",
                    severity=Severity.CRITICAL,
                    code=f"type={cmd_type}\ncmd={cmd_str[:200]}",
                    remediation=(
                        "Ce plugin tente d'exécuter une commande dangereuse à l'initialisation. "
                        "Cela constitue un comportement malveillant potentiel."
                    ),
                )
            )
            score += SCORE_MAP[Severity.CRITICAL]
        else:
            findings.append(
                Finding(
                    message=f"[RUNTIME] Commande shell détectée à l'exécution : {cmd_type}",
                    severity=Severity.HIGH,
                    code=f"type={cmd_type}\ncmd={cmd_str[:200]}",
                    remediation=(
                        "Le plugin exécute une commande shell au démarrage. "
                        "Vérifiez que cette commande est nécessaire et sécurisée."
                    ),
                )
            )
            score += SCORE_MAP[Severity.HIGH]

    if intercepted:
        logger.warning(
            "[gate_11/sandbox] %d commande(s) shell interceptée(s) à l'exécution",
            len(intercepted),
        )

    return findings, score


# ── Gate principale ───────────────────────────────────────────────────────────

async def gate_11(source_dir: Path, sandbox_timeout: int = 12) -> GateResult:
    """
    Gate 11 — Détection des commandes shell/système (AST + sandbox runtime).
    """
    started = time.time()
    findings: list[Finding] = []
    score = 0

    # Charge la liste allowed_imports depuis plugin.yaml
    allowed_imports = _get_allowed_imports(source_dir)
    logger.info(
        "[gate_11] allowed_imports déclarés : %s",
        sorted(allowed_imports) or "aucun",
    )

    # ── Passe 1 : AST statique ────────────────────────────────────────────────
    ast_findings, ast_score = _ast_scan(source_dir, allowed_imports)
    findings.extend(ast_findings)
    score += ast_score

    # ── Passe 2 : sandbox runtime ─────────────────────────────────────────────
    manifest = _xcore_manifest(source_dir)
    if manifest is not None:
        try:
            rt_findings, rt_score = await _runtime_scan(source_dir, manifest, sandbox_timeout)
            findings.extend(rt_findings)
            score += rt_score
        except Exception as exc:
            logger.warning("[gate_11] Erreur sandbox runtime : %s", exc)
    else:
        findings.append(
            Finding(
                message="[GATE_11] Manifeste introuvable — passe runtime ignorée, AST seul",
                severity=Severity.INFO,
            )
        )

    logger.info(
        "[gate_11] %d finding(s) AST + runtime — score=%d — allowed=%s",
        len(findings), score, sorted(allowed_imports) or "aucun",
    )

    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )
    return make_result("gate_11_runtime_sandbox", status, score, findings, started)
