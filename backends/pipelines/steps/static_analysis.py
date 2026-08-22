"""Gate 2 — Analyse statique (Scanner AST personnalisé + Entropie + Taint)."""

from __future__ import annotations

import ast as _ast
import logging
import math
import re
import time
from pathlib import Path
from typing import NamedTuple

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

_HIGH_ENTROPY_RE = re.compile(r'["\']([A-Za-z0-9+/=_\-]{20,})["\']')
_FORBIDDEN_BUILTINS = {"exec", "eval", "compile", "__import__"}

_BUILTIN_REMEDIATION = {
    "eval": (
        "eval() exécute du code arbitraire. Utilisez ast.literal_eval() pour parser "
        "des données sérialisées, ou refactorisez pour éviter l'évaluation dynamique."
    ),
    "exec": (
        "exec() exécute du code arbitraire. Si vous devez exécuter du code dynamique, "
        "utilisez un subprocess isolé avec des permissions restreintes."
    ),
    "compile": (
        "compile() peut être utilisé pour construire du code malveillant. "
        "Préférez des approches statiques ou des templates sécurisés."
    ),
    "__import__": (
        "__import__() bypasse les mécanismes de sécurité des imports. "
        "Utilisez importlib.import_module() à la place."
    ),
}


# ─────────────────────────────────────────────────────────────
#  Règles du scanner AST personnalisé
# ─────────────────────────────────────────────────────────────

class _Rule(NamedTuple):
    id: str
    message: str
    severity: Severity
    remediation: str


# Appels de fonctions dangereux : (module_ou_None, attribut_ou_func) → Rule
_DANGEROUS_CALLS: dict[tuple[str | None, str], _Rule] = {
    # Exécution shell / subprocess
    ("os", "system"):         _Rule("R001", "os.system() exécute une commande shell sans protection",       Severity.HIGH,     "Utilisez subprocess.run() avec une liste d'arguments (pas shell=True) et validez chaque argument."),
    ("os", "popen"):          _Rule("R002", "os.popen() ouvre un shell sans échappement",                   Severity.HIGH,     "Utilisez subprocess.run() avec shell=False."),
    ("subprocess", "call"):   _Rule("R003", "subprocess.call() avec shell=True est dangereux",              Severity.MEDIUM,   "Passez une liste d'arguments et omettez shell=True."),
    ("subprocess", "Popen"):  _Rule("R004", "Vérifiez que subprocess.Popen n'utilise pas shell=True",       Severity.MEDIUM,   "Utilisez shell=False et passez les arguments sous forme de liste."),
    # Désérialisation non sécurisée
    ("pickle", "loads"):      _Rule("R010", "pickle.loads() exécute du code arbitraire à la désérialisation", Severity.HIGH,  "N'utilisez jamais pickle avec des données non-fiables. Préférez JSON ou msgpack."),
    ("pickle", "load"):       _Rule("R011", "pickle.load() exécute du code arbitraire à la désérialisation",  Severity.HIGH,  "N'utilisez jamais pickle avec des données non-fiables. Préférez JSON ou msgpack."),
    ("marshal", "loads"):     _Rule("R012", "marshal.loads() peut exécuter du code arbitraire",              Severity.HIGH,   "Évitez marshal pour les données externes. Utilisez JSON."),
    ("marshal", "load"):      _Rule("R013", "marshal.load() peut exécuter du code arbitraire",               Severity.HIGH,   "Évitez marshal pour les données externes. Utilisez JSON."),
    ("shelve", "open"):       _Rule("R014", "shelve utilise pickle en interne — risque de désérialisation",  Severity.MEDIUM, "Vérifiez que shelve ne charge que vos propres données."),
    # YAML non sécurisé
    ("yaml", "load"):         _Rule("R020", "yaml.load() sans Loader= sûr exécute du code Python arbitraire", Severity.HIGH, "Utilisez yaml.safe_load() ou yaml.load(data, Loader=yaml.SafeLoader)."),
    # Cryptographie faible
    ("hashlib", "md5"):       _Rule("R030", "MD5 est cryptographiquement cassé",                            Severity.MEDIUM,  "Utilisez hashlib.sha256() ou hashlib.sha3_256() pour les besoins de sécurité."),
    ("hashlib", "sha1"):      _Rule("R031", "SHA-1 est cryptographiquement affaibli",                       Severity.MEDIUM,  "Utilisez hashlib.sha256() ou SHA-3 pour les besoins de sécurité."),
    # Requêtes HTTP sans vérification TLS
    ("ssl", "create_default_context"): _Rule("R040", "Vérifiez que le contexte SSL n'a pas check_hostname=False", Severity.LOW, "Ne désactivez pas la vérification TLS. Utilisez ssl.create_default_context() sans modification."),
    # Générateurs aléatoires non cryptographiques pour usage de sécurité
    ("random", "random"):     _Rule("R050", "random.random() n'est pas cryptographiquement sécurisé",        Severity.LOW,    "Utilisez secrets.token_bytes() ou os.urandom() pour les besoins de sécurité."),
    ("random", "randint"):    _Rule("R051", "random.randint() n'est pas cryptographiquement sécurisé",       Severity.LOW,    "Utilisez secrets.randbelow() pour les besoins de sécurité."),
    ("random", "choice"):     _Rule("R052", "random.choice() n'est pas cryptographiquement sécurisé",        Severity.LOW,    "Utilisez secrets.choice() pour les besoins de sécurité."),
    # Fichiers temporaires non sécurisés
    ("tempfile", "mktemp"):   _Rule("R060", "tempfile.mktemp() est vulnérable aux race conditions (TOCTOU)", Severity.MEDIUM, "Utilisez tempfile.NamedTemporaryFile() ou tempfile.mkstemp() à la place."),
    # Réseau (informationnel)
    ("urllib", "urlopen"):    _Rule("R070", "urllib.urlopen() — vérifiez la validation TLS et des URLs",     Severity.LOW,    "Validez les URLs, utilisez HTTPS, et vérifiez les certificats."),
    ("ftplib", "FTP"):        _Rule("R071", "FTP transmet les credentials en clair",                         Severity.MEDIUM, "Utilisez SFTP (paramiko) ou FTPS (ftplib.FTP_TLS) à la place."),
    # Injection de commande via format strings (patterns)
    ("os", "execve"):         _Rule("R080", "os.execve() remplace le processus courant — usage dangereux",   Severity.HIGH,   "Vérifiez que les arguments ne proviennent pas de l'utilisateur sans validation."),
    ("os", "execvp"):         _Rule("R081", "os.execvp() — risque d'injection si arguments non validés",     Severity.HIGH,   "Validez chaque argument. Ne passez pas de chaînes construites depuis l'entrée utilisateur."),
}

# Attributs d'objet SSL potentiellement dangereux
_DANGEROUS_ASSIGNS: dict[str, _Rule] = {
    "check_hostname": _Rule("R041", "check_hostname=False désactive la vérification du nom d'hôte TLS",    Severity.HIGH, "Ne désactivez jamais check_hostname. Cela expose aux attaques MITM."),
    "verify_mode":   _Rule("R042", "verify_mode=ssl.CERT_NONE désactive la vérification du certificat",     Severity.HIGH, "Utilisez ssl.CERT_REQUIRED (valeur par défaut). Ne désactivez pas la vérification TLS."),
}

# Imports dangereux à signaler
_DANGEROUS_IMPORTS: dict[str, _Rule] = {
    "ctypes":   _Rule("R090", "Import de ctypes — appels directs aux bibliothèques C/OS",     Severity.HIGH,   "ctypes permet de contourner les protections Python. Justifiez son usage dans plugin.yaml."),
    "cffi":     _Rule("R091", "Import de cffi — appels natifs C (cffi)",                      Severity.MEDIUM, "Déclarez la permission dans plugin.yaml si nécessaire."),
    "pty":      _Rule("R092", "Import de pty — pseudo-terminal, risque d'élévation",          Severity.HIGH,   "pty est rarement justifié dans un plugin. Supprimez-le si non nécessaire."),
    "Crypto":   _Rule("R093", "PyCrypto est abandonné et contient des vulnérabilités connues", Severity.MEDIUM, "Utilisez cryptography (pip install cryptography) à la place de PyCrypto."),
}


def _shannon(s: str) -> float:
    if not s:
        return 0.0
    freq: dict[str, int] = {}
    for c in s:
        freq[c] = freq.get(c, 0) + 1
    return -sum((f / len(s)) * math.log2(f / len(s)) for f in freq.values())


def _get_source_line(py: Path, lineno: int) -> str:
    try:
        lines = py.read_text(encoding="utf-8", errors="ignore").splitlines()
        if 0 < lineno <= len(lines):
            return lines[lineno - 1].strip()
    except Exception:
        pass
    return ""


def _call_name(node: _ast.Call) -> tuple[str | None, str]:
    """Retourne (module, attr) pour un appel. Ex: os.system → ('os','system'), eval → (None,'eval')."""
    if isinstance(node.func, _ast.Name):
        return None, node.func.id
    if isinstance(node.func, _ast.Attribute):
        if isinstance(node.func.value, _ast.Name):
            return node.func.value.id, node.func.attr
    return None, ""


# ─────────────────────────────────────────────────────────────
#  Taint Analysis
# ─────────────────────────────────────────────────────────────

class TaintScanner(_ast.NodeVisitor):
    SOURCES = {"os.getenv", "sys.argv", "input", "os.environ.get"}
    SINKS = {
        "os.system": "exécution shell",
        "subprocess.run": "exécution subprocess",
        "subprocess.call": "exécution subprocess",
        "subprocess.Popen": "exécution subprocess",
        "eval": "évaluation de code",
        "exec": "exécution de code",
    }

    def __init__(self, rel_path: str, source_lines: list[str]):
        self.rel_path = rel_path
        self.source_lines = source_lines
        self.tainted_vars: dict[str, str] = {}
        self.findings: list[Finding] = []

    def visit_Assign(self, node: _ast.Assign):
        if isinstance(node.value, _ast.Call):
            name = self._get_call_name(node.value)
            if name in self.SOURCES:
                for target in node.targets:
                    if isinstance(target, _ast.Name):
                        self.tainted_vars[target.id] = name
        self.generic_visit(node)

    def visit_Call(self, node: _ast.Call):
        call_name = self._get_call_name(node)
        if call_name in self.SINKS:
            sink_desc = self.SINKS[call_name]
            for arg in node.args:
                if isinstance(arg, _ast.Name) and arg.id in self.tainted_vars:
                    source = self.tainted_vars[arg.id]
                    self.findings.append(
                        Finding(
                            message=(
                                f"Injection potentielle : variable `{arg.id}` "
                                f"(provenant de `{source}`) transmise à `{call_name}` ({sink_desc})"
                            ),
                            severity=Severity.CRITICAL,
                            file=self.rel_path,
                            line=node.lineno,
                            code=self._get_line(node.lineno),
                            remediation=(
                                f"Validez et assainissez `{arg.id}` avant de le passer à `{call_name}`. "
                                f"Les données venant de `{source}` ne doivent jamais être transmises "
                                f"directement à des fonctions d'exécution sans validation stricte."
                            ),
                        )
                    )
        self.generic_visit(node)

    def _get_call_name(self, node: _ast.Call) -> str:
        if isinstance(node.func, _ast.Name):
            return node.func.id
        if isinstance(node.func, _ast.Attribute):
            if isinstance(node.func.value, _ast.Name):
                return f"{node.func.value.id}.{node.func.attr}"
        return ""

    def _get_line(self, lineno: int) -> str:
        if 0 < lineno <= len(self.source_lines):
            return self.source_lines[lineno - 1].strip()
        return ""


# ─────────────────────────────────────────────────────────────
#  Scanner principal par fichier
# ─────────────────────────────────────────────────────────────

def _scan_file(py: Path, source_dir: Path) -> tuple[list[Finding], int]:
    findings: list[Finding] = []
    score = 0
    rel_path = str(py.relative_to(source_dir))

    try:
        content = py.read_text(encoding="utf-8", errors="ignore")
        source_lines = content.splitlines()
        tree = _ast.parse(content, filename=rel_path)
    except SyntaxError as e:
        findings.append(
            Finding(
                f"Erreur de syntaxe Python : {e.msg} (ligne {e.lineno})",
                Severity.MEDIUM,
                file=rel_path,
                line=e.lineno,
                remediation="Corrigez l'erreur de syntaxe. Le fichier n'a pas pu être analysé.",
            )
        )
        return findings, SCORE_MAP[Severity.MEDIUM]
    except Exception:
        return findings, 0

    def line_src(lineno: int) -> str:
        if 0 < lineno <= len(source_lines):
            return source_lines[lineno - 1].strip()
        return ""

    # ── Imports dangereux ─────────────────────────────────────
    for node in _ast.walk(tree):
        if not isinstance(node, (_ast.Import, _ast.ImportFrom)):
            continue
        if isinstance(node, _ast.Import):
            names = [a.name.split(".")[0] for a in node.names]
        else:
            names = [node.module.split(".")[0]] if node.module else []
        for n in names:
            if n in _DANGEROUS_IMPORTS:
                rule = _DANGEROUS_IMPORTS[n]
                findings.append(
                    Finding(
                        message=f"[{rule.id}] {rule.message}",
                        severity=rule.severity,
                        file=rel_path,
                        line=node.lineno,
                        code=line_src(node.lineno),
                        remediation=rule.remediation,
                    )
                )
                score += SCORE_MAP[rule.severity]

    # ── Appels dangereux ──────────────────────────────────────
    for node in _ast.walk(tree):
        if not isinstance(node, _ast.Call):
            continue
        mod, attr = _call_name(node)
        rule = _DANGEROUS_CALLS.get((mod, attr))
        if rule is None:
            continue
        # Cas spécial yaml.load : ne flag que si pas de Loader safe
        if (mod, attr) == ("yaml", "load"):
            if _yaml_load_is_safe(node):
                continue
        findings.append(
            Finding(
                message=f"[{rule.id}] {rule.message}",
                severity=rule.severity,
                file=rel_path,
                line=node.lineno,
                code=line_src(node.lineno),
                remediation=rule.remediation,
            )
        )
        score += SCORE_MAP[rule.severity]

    # ── Assignations dangereuses (ex: ctx.check_hostname = False) ─
    for node in _ast.walk(tree):
        if not isinstance(node, _ast.Assign):
            continue
        for target in node.targets:
            if not isinstance(target, _ast.Attribute):
                continue
            rule = _DANGEROUS_ASSIGNS.get(target.attr)
            if rule is None:
                continue
            # Vérifie que la valeur est False ou ssl.CERT_NONE
            val = node.value
            is_dangerous = (
                (isinstance(val, _ast.Constant) and val.value is False)
                or (
                    isinstance(val, _ast.Attribute)
                    and isinstance(val.value, _ast.Name)
                    and val.value.id == "ssl"
                    and val.attr == "CERT_NONE"
                )
            )
            if is_dangerous:
                findings.append(
                    Finding(
                        message=f"[{rule.id}] {rule.message}",
                        severity=rule.severity,
                        file=rel_path,
                        line=node.lineno,
                        code=line_src(node.lineno),
                        remediation=rule.remediation,
                    )
                )
                score += SCORE_MAP[rule.severity]

    # ── Builtins directs interdits ────────────────────────────
    for node in _ast.walk(tree):
        if not isinstance(node, _ast.Call):
            continue
        if not isinstance(node.func, _ast.Name):
            continue
        name = node.func.id
        if name not in _FORBIDDEN_BUILTINS:
            continue
        findings.append(
            Finding(
                message=f"Appel direct à `{name}()` interdit (ligne {node.lineno})",
                severity=Severity.HIGH,
                file=rel_path,
                line=node.lineno,
                code=line_src(node.lineno),
                remediation=_BUILTIN_REMEDIATION.get(name, f"Évitez `{name}()`."),
            )
        )
        score += SCORE_MAP[Severity.HIGH]

    # ── Taint Analysis ────────────────────────────────────────
    scanner = TaintScanner(rel_path, source_lines)
    scanner.visit(tree)
    for f in scanner.findings:
        findings.append(f)
        score += SCORE_MAP[f.severity]

    return findings, score


def _yaml_load_is_safe(node: _ast.Call) -> bool:
    """Retourne True si yaml.load() utilise un Loader sécurisé."""
    safe_loaders = {"SafeLoader", "CSafeLoader", "BaseLoader"}
    for kw in node.keywords:
        if kw.arg == "Loader":
            v = kw.value
            if isinstance(v, _ast.Attribute) and v.attr in safe_loaders:
                return True
            if isinstance(v, _ast.Name) and v.id in safe_loaders:
                return True
    return False


# ─────────────────────────────────────────────────────────────
#  Gate principale
# ─────────────────────────────────────────────────────────────

async def gate_2(source_dir: Path) -> GateResult:
    started = time.time()
    findings: list[Finding] = []
    score = 0

    py_files = list(source_dir.rglob("*.py"))
    logger.info(f"[gate_2] Scanner AST personnalisé sur {len(py_files)} fichier(s)")

    # Analyse fichier par fichier
    for py in py_files:
        file_findings, file_score = _scan_file(py, source_dir)
        findings.extend(file_findings)
        score += file_score

    # Entropie — chaînes suspectes (potentiels secrets hardcodés)
    seen_entropy: set[str] = set()
    for py in py_files:
        try:
            rel_path = str(py.relative_to(source_dir))
            content = py.read_text(encoding="utf-8", errors="ignore")
            lines = content.splitlines()
            for lineno, line in enumerate(lines, 1):
                for m in _HIGH_ENTROPY_RE.finditer(line):
                    cand = m.group(1)
                    entropy = _shannon(cand)
                    if entropy > 4.5 and cand not in seen_entropy:
                        seen_entropy.add(cand)
                        masked = cand[:6] + "…" + cand[-4:] if len(cand) > 12 else cand[:4] + "…"
                        findings.append(
                            Finding(
                                message=(
                                    f"Chaîne à haute entropie ({entropy:.2f} bits/char) "
                                    f"— potentiel secret hardcodé"
                                ),
                                severity=Severity.MEDIUM,
                                file=rel_path,
                                line=lineno,
                                code=f"Valeur (masquée) : {masked!r}  |  Ligne : {line.strip()[:80]}",
                                remediation=(
                                    "Déplacez cette valeur dans une variable d'environnement "
                                    "ou un gestionnaire de secrets (Vault, AWS Secrets Manager). "
                                    "Ne commitez jamais de clés ou tokens dans le code source."
                                ),
                            )
                        )
                        score += SCORE_MAP[Severity.MEDIUM]
        except Exception:
            pass

    logger.info(f"[gate_2] {len(findings)} finding(s) — score={score}")

    status = (
        GateStatus.PASSED
        if score == 0
        else (GateStatus.BLOCKED if score >= SCORE_AUTO_REJECT else GateStatus.FAILED)
    )
    return make_result("gate_2_static", status, score, findings, started)
