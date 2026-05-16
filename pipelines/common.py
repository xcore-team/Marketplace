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


def _ensure_dotenv(source_dir: Path) -> Path | None:
    """
    Si plugin.yaml déclare envconfiguration.inject=true et que le fichier .env
    n'existe pas, crée un .env stub avec des valeurs vides (ou celles de la
    section `env:`) pour que ManifestValidator ne lève pas ManifestError.

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
    if not envcfg.get("inject", False):
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

    # Génère les clés depuis la section `env:` avec des valeurs vides
    env_section: dict = data.get("env", {}) or {}
    lines = [
        "# Généré automatiquement par le pipeline de validation",
        "# Ces valeurs par défaut permettent l'analyse du plugin.",
        "# Remplacez-les par vos vraies valeurs en production.",
        "",
    ]
    for key, default in env_section.items():
        if isinstance(default, str) and default.startswith("${") and default.endswith("}"):
            # ${VAR_NAME} → on extrait le nom réel ou on met vide
            inner = default[2:-1].split(":-")
            val = inner[1] if len(inner) > 1 else ""
        elif default is None:
            val = ""
        else:
            val = str(default)
        lines.append(f"{key}={val}")

    if not lines[-1]:  # si la section env était vide, ajouter une ligne commentaire
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
