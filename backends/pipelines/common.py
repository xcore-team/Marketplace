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


import re as _re

# Valeurs mock par défaut selon le nom de la variable.
# Permet au plugin de démarrer sans crasher pendant la validation pipeline.
_ENV_MOCK_RULES: list[tuple[_re.Pattern, str]] = [
    # Base de données
    (_re.compile(r'(?i)database_url|db_url'),          'sqlite+aiosqlite:///validation_stub.db'),
    (_re.compile(r'(?i)postgres(?:ql)?_?(?:url|dsn)'), 'postgresql+asyncpg://user:pass@localhost/stub'),
    (_re.compile(r'(?i)mysql_?(?:url|dsn)'),           'mysql+aiomysql://user:pass@localhost/stub'),
    # Redis
    (_re.compile(r'(?i)redis_?url'),                   'redis://localhost:6379/0'),
    (_re.compile(r'(?i)redis_?host'),                  'localhost'),
    (_re.compile(r'(?i)redis_?port'),                  '6379'),
    # SMTP / Mail
    (_re.compile(r'(?i)smtp_?host|mail_?host'),        'localhost'),
    (_re.compile(r'(?i)smtp_?port|mail_?port'),        '25'),
    (_re.compile(r'(?i)smtp_?user|mail_?user|mail_?from'), 'noreply@example.com'),
    (_re.compile(r'(?i)smtp_?pass|mail_?pass'),        'stub_smtp_password'),
    (_re.compile(r'(?i)smtp_?from|mail_?from'),        'noreply@example.com'),
    (_re.compile(r'(?i)smtp_?tls|mail_?tls'),          'false'),
    # Ports génériques
    (_re.compile(r'(?i).*_port$'),                     '8080'),
    (_re.compile(r'(?i).*_host$'),                     'localhost'),
    # Secrets / Clés
    (_re.compile(r'(?i)secret_?key|app_?secret'),      'stub-secret-key-validation-only'),
    (_re.compile(r'(?i)jwt_?secret|jwt_?key'),         'stub-jwt-secret-validation-only'),
    (_re.compile(r'(?i)api_?key|api_?token'),          'stub-api-key-validation-only'),
    (_re.compile(r'(?i).*_?token$'),                   'stub-token-validation-only'),
    (_re.compile(r'(?i).*_?key$'),                     'stub-key-validation-only'),
    (_re.compile(r'(?i).*_?secret$'),                  'stub-secret-validation-only'),
    (_re.compile(r'(?i).*_?password$|.*_?passwd$'),    'stub_password'),
    # URLs génériques
    (_re.compile(r'(?i).*_url$'),                      'http://localhost:8080'),
    # Booléens
    (_re.compile(r'(?i)debug'),                        'false'),
    (_re.compile(r'(?i).*_?enabled$'),                 'false'),
    (_re.compile(r'(?i).*_?tls$|.*_?ssl$'),            'false'),
]


def _mock_value_for(key: str, declared_default: str) -> str:
    """Renvoie une valeur mock utilisable pour la clé donnée."""
    # Si le plugin a déjà déclaré une default dans ${VAR:-default}, on l'utilise.
    if declared_default:
        return declared_default
    # Sinon on cherche dans les règles par nom de variable.
    for pattern, mock in _ENV_MOCK_RULES:
        if pattern.search(key):
            return mock
    return "stub_value"


def _ensure_dotenv(source_dir: Path, force: bool = False) -> Path | None:
    """
    Crée un fichier .env stub avec des valeurs mock utilisables si le plugin en a besoin.

    Comportement :
    - Toujours actif si `envconfiguration.inject=true` dans plugin.yaml.
    - Actif aussi si `force=True` (gates qui appellent ManifestValidator indépendamment
      du flag inject, ex: gate_5, gate_7) — crée le stub dès qu'une section `env:` existe.

    Les valeurs générées sont des mocks (pas de vraies credentials) qui permettent au
    plugin de passer la validation sans crasher au démarrage.

    Retourne le chemin du fichier créé, ou None si rien n'a été fait.
    """
    yaml_path = source_dir / "plugin.yaml"
    if not yaml_path.exists():
        return None
    try:
        import yaml as _yaml

        data = _yaml.safe_load(yaml_path.read_text(encoding="utf-8")) or {}
    except Exception:
        return None

    envcfg = data.get("envconfiguration") or {}
    inject_required = envcfg.get("inject", False)
    env_section: dict = data.get("env", {}) or {}

    # On crée le stub seulement si inject=true OU si force=True et qu'il y a des vars.
    if not inject_required and not (force and env_section):
        return None

    env_file = envcfg.get("env_file", ".env")
    env_path = (source_dir / env_file).resolve()

    # Sécurité : pas de traversal
    try:
        env_path.relative_to(source_dir.resolve())
    except ValueError:
        return None

    if env_path.exists():
        return None  # Déjà présent

    # Génère les clés depuis la section `env:` avec des valeurs mock utilisables.
    lines = [
        "# Généré automatiquement par le pipeline de validation.",
        "# Valeurs mock — le plugin peut démarrer mais ne se connecte à rien de réel.",
        "# Remplacez par vos vraies valeurs en production.",
        "",
    ]
    for key, declared in env_section.items():
        declared_str = ""
        stub_key = key  # par défaut : la clé de la section env
        if isinstance(declared, str) and declared.startswith("${") and declared.endswith("}"):
            # ${VAR_NAME} → pas de default   |   ${VAR:-default} → on prend le default
            inner = declared[2:-1].split(":-", 1)
            declared_str = inner[1] if len(inner) > 1 else ""
            # Le validator résout ${VAR_NAME} via os.environ.get("VAR_NAME"),
            # donc le stub doit utiliser VAR_NAME comme clé, pas la clé de section.
            stub_key = inner[0]
        elif declared is not None:
            declared_str = str(declared)

        val = _mock_value_for(stub_key, declared_str)
        lines.append(f"{stub_key}={val}")

    if len(lines) == 4:  # seulement le header, section env vide
        lines.append("# Aucune variable d'environnement déclarée dans plugin.yaml")

    env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    logger.info(
        f"[pipeline] .env stub créé : {env_path.relative_to(source_dir)} "
        f"({len(env_section)} var(s))"
    )
    return env_path


def _xcore_manifest(source_dir: Path):
    _ensure_dotenv(source_dir)
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
