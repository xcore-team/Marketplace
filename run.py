"""
run.py — Point d'entrée unique de XCore Market.

Initialisation complète avant le démarrage :
  1. Chargement des variables d'environnement (.env)
  2. Migrations de base de données (marketplace, xauth, xdocs)
  3. Seed initial (admin, rôles, permissions)
  4. Démarrage de l'API uvicorn
  5. Démarrage du worker Celery

Usage :
    uv run python run.py
    uv run python run.py --host 0.0.0.0 --port 8080 --workers 4
    uv run python run.py --reload              # dev
    uv run python run.py --no-celery           # API seule
    uv run python run.py --no-api              # worker seul
    uv run python run.py --skip-migrations     # sans migrations
    uv run python run.py --skip-seed           # sans seed
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

logger = logging.getLogger("xcore-market.run")

PROCESSES: list[subprocess.Popen] = []

# ── Plugins avec migrations ────────────────────────────────────────────────────
_MIGRATIONS = [
    ("xauth",       "app/xauth/migrations",       "app.xauth.src.models"),
    ("marketplace", "app/marketplace/migrations",  "app.marketplace.src.models"),
    ("xdocs",       "app/xdocs/migrations",        "app.xdocs.src.models"),
]


# ── Environnement ─────────────────────────────────────────────────────────────

def _load_env() -> None:
    """Charge les fichiers .env dans l'ordre de priorité."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        print("[run] python-dotenv non installé — variables d'env non chargées depuis .env")
        return

    env_files = [
        Path("extensions/.env"),
        Path(".env"),
    ]
    for env_file in env_files:
        if env_file.exists():
            load_dotenv(env_file, override=False)
            print(f"[run] Env chargé depuis {env_file}")


# ── Migrations ────────────────────────────────────────────────────────────────

async def _run_migrations(db_url: str) -> None:
    """Crée les tables (create_all) puis applique les migrations Alembic."""
    from xcore.services.database.migrations import MigrationRunner

    for plugin_name, migrations_dir, models_module in _MIGRATIONS:
        # 1. Toujours créer les tables manquantes (idempotent)
        await _create_all_fallback(db_url, models_module, plugin_name)

        # 2. Appliquer les éventuelles migrations de schéma
        migrations_path = Path(migrations_dir).resolve()
        if not migrations_path.exists():
            print(f"[run] [{plugin_name}] Dossier migrations introuvable — ignoré")
            continue

        runner = MigrationRunner(db_url=db_url, migrations_dir=migrations_path)
        try:
            await runner.upgrade()
            print(f"[run] [{plugin_name}] Migrations appliquées")
        except Exception as exc:
            print(f"[run] [{plugin_name}] Migration upgrade ignorée (non bloquant) : {exc}")


async def _create_all_fallback(db_url: str, models_module: str, plugin_name: str) -> None:
    from sqlalchemy.ext.asyncio import create_async_engine
    import importlib

    try:
        mod = importlib.import_module(models_module)
        base = mod.Base
        engine = create_async_engine(db_url, echo=False)
        async with engine.begin() as conn:
            await conn.run_sync(base.metadata.create_all)
        await engine.dispose()
        print(f"[run] [{plugin_name}] Tables créées via create_all")
    except Exception as exc:
        print(f"[run] [{plugin_name}] create_all échoué : {exc}")


# ── Seed ─────────────────────────────────────────────────────────────────────

async def _run_seed(db_url: str) -> None:
    """Lance le seed xauth (admin, rôles, permissions, tenant par défaut)."""
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from app.xauth.src.services.seed import run_seed

    engine = create_async_engine(db_url, echo=False)

    class _DBShim:
        """Shim minimal pour compatibilité avec run_seed(db)."""
        def session(self):
            return async_sessionmaker(engine, expire_on_commit=False)()

    try:
        await run_seed(_DBShim())
        print("[run] Seed xauth terminé (admin, rôles, permissions)")
    except Exception as exc:
        print(f"[run] Seed échoué (non bloquant) : {exc}")
    finally:
        await engine.dispose()


# ── Init globale ──────────────────────────────────────────────────────────────

def _init(skip_migrations: bool, skip_seed: bool) -> None:
    """Exécute migrations + seed de manière synchrone avant le démarrage des processus."""
    import yaml

    # Lit la DB URL depuis integration.yaml
    try:
        with open("integration.yaml") as f:
            config = yaml.safe_load(f)
        db_url = config["services"]["databases"]["db"]["url"]
    except Exception as exc:
        print(f"[run] Impossible de lire l'URL DB depuis integration.yaml : {exc}")
        sys.exit(1)

    # Résout les variables d'env dans l'URL si nécessaire
    db_url = os.path.expandvars(db_url)

    async def _run_all():
        if not skip_migrations:
            print("[run] ── Migrations ──────────────────────────")
            await _run_migrations(db_url)
        else:
            print("[run] Migrations ignorées (--skip-migrations)")

        if not skip_seed:
            print("[run] ── Seed ────────────────────────────────")
            await _run_seed(db_url)
        else:
            print("[run] Seed ignoré (--skip-seed)")

    asyncio.run(_run_all())


# ── Processus ─────────────────────────────────────────────────────────────────

def _build_api_cmd(host: str, port: int, workers: int, reload: bool) -> list[str]:
    cmd = [sys.executable, "-m", "uvicorn", "main:app",
           "--host", host, "--port", str(port), "--log-level", "info"]
    if reload:
        cmd.append("--reload")
    else:
        cmd += ["--workers", str(workers)]
    return cmd


def _build_celery_cmd(concurrency: int) -> list[str]:
    return [
        sys.executable, "-m", "celery",
        "-A", "extensions.xworker.app", "worker",
        "--loglevel=info",
        "-Q", "submissions,default",
        f"--concurrency={concurrency}",
    ]


def _shutdown(signum, frame) -> None:
    print("\n[run] Signal reçu — arrêt des processus...")
    for p in PROCESSES:
        if p.poll() is None:
            p.terminate()

    deadline = time.time() + 10
    for p in PROCESSES:
        remaining = max(0, deadline - time.time())
        try:
            p.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            print(f"[run] Processus {p.pid} ne répond pas — kill forcé")
            p.kill()

    sys.exit(0)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="XCore Market — lanceur tout-en-un")
    parser.add_argument("--host",               default="0.0.0.0")
    parser.add_argument("--port",               type=int, default=8000)
    parser.add_argument("--workers",            type=int, default=1,
                        help="Workers uvicorn (ignoré si --reload)")
    parser.add_argument("--celery-concurrency", type=int, default=4)
    parser.add_argument("--reload",             action="store_true",
                        help="Hot-reload uvicorn (dev)")
    parser.add_argument("--no-celery",          action="store_true",
                        help="Lance uniquement l'API")
    parser.add_argument("--no-api",             action="store_true",
                        help="Lance uniquement Celery")
    parser.add_argument("--skip-migrations",    action="store_true",
                        help="Ignore les migrations Alembic")
    parser.add_argument("--skip-seed",          action="store_true",
                        help="Ignore le seed initial (admin, rôles)")
    args = parser.parse_args()

    # 1. Charger les variables d'env
    _load_env()

    # 2. Migrations + seed (avant tout démarrage de processus)
    print("[run] ══ Initialisation XCore Market ══════════════")
    _init(skip_migrations=args.skip_migrations, skip_seed=args.skip_seed)
    print("[run] ══ Initialisation terminée ══════════════════")

    # 3. Signaux d'arrêt
    signal.signal(signal.SIGINT,  _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    env = os.environ.copy()

    # 4. Démarrer les processus
    if not args.no_celery:
        celery_cmd = _build_celery_cmd(args.celery_concurrency)
        print(f"[run] Celery → {' '.join(celery_cmd)}")
        PROCESSES.append(subprocess.Popen(celery_cmd, env=env))

    if not args.no_api:
        api_cmd = _build_api_cmd(args.host, args.port, args.workers, args.reload)
        print(f"[run] API    → {' '.join(api_cmd)}")
        PROCESSES.append(subprocess.Popen(api_cmd, env=env))

    if not PROCESSES:
        print("[run] Rien à lancer (--no-celery et --no-api simultanés).")
        sys.exit(1)

    # 5. Surveillance — arrêt global si un processus crash
    while True:
        for p in PROCESSES:
            if p.poll() is not None:
                print(f"[run] Processus {p.pid} terminé (code {p.returncode}) — arrêt global.")
                _shutdown(None, None)
        time.sleep(2)


if __name__ == "__main__":
    main()
