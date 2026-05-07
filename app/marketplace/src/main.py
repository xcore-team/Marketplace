"""marketplace/src/main.py — Plugin xcore Marketplace."""

from __future__ import annotations

import logging

from fastapi import APIRouter
from xcore.sdk import AutoDispatchMixin, TrustedBase

from sandbox import SandboxLimits

from .ipc import IPCCommands
from .models import Base
from .notifications.pipeline import NotificationPipeline
from .routes import admin_router, categories_router, github_router, plugins_router, submissions_router

logger = logging.getLogger("hub.marketplace")


class Plugin(IPCCommands, AutoDispatchMixin, TrustedBase):
    """
    Plugin xcore — Marketplace de plugins.

    Requiert :
    - Plugin 'auth' chargé (enregistre le backend JWT pour get_current_user / require_permission)
    - Service 'db' partagé (même base SQLite/Postgres que les autres plugins)
    - Service 'ext.email' (optionnel — notifications simulées si absent)

    Permissions RBAC utilisées dans les routes :
    - plugins:write      — créer / supprimer un plugin
    - submissions:write  — soumettre un ZIP ou publier depuis GitHub
    """

    async def on_load(self) -> None:
        self.app = APIRouter()

        env = self.ctx.env
        db = self.get_service("db")
        self._db = db

        # ── Tables ───────────────────────────────────────────────────────────
        async with db.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("[marketplace] Tables créées / vérifiées")

        # ── Email ─────────────────────────────────────────────────────────────
        try:
            email_service = self.get_service("ext.email")
        except Exception:
            email_service = None
            logger.warning("[marketplace] ext.email indisponible — notifications simulées")

        notif = NotificationPipeline(
            email_service=email_service,
            app_name=env.get("APP_NAME", "xcore-market"),
        )

        # ── Config sandbox depuis l'env du plugin ─────────────────────────────
        secret_key = env.get("MARKET_SECRET_KEY", "").encode()
        limits = SandboxLimits(
            memory_mb=int(env.get("SANDBOX_MEMORY_MB", "128")),
            cpu_seconds=int(env.get("SANDBOX_CPU_SECONDS", "10")),
            timeout=int(env.get("SANDBOX_TIMEOUT", "30")),
        )
        logger.info(
            f"[marketplace] Sandbox — mem={limits.memory_mb}MB "
            f"cpu={limits.cpu_seconds}s timeout={limits.timeout}s"
        )

        # ── Routes (pattern xauth : db passé en closure) ──────────────────────
        self.app.include_router(admin_router(db))
        self.app.include_router(categories_router(db))
        self.app.include_router(plugins_router(db))
        self.app.include_router(submissions_router(db, notif, secret_key, limits))
        self.app.include_router(github_router(db, notif, secret_key, limits))

        logger.info("[marketplace] Prêt — /categories  /plugins  /submissions  /github")

    async def on_unload(self) -> None:
        logger.info("[marketplace] Déchargé")

    def get_router(self) -> APIRouter | None:
        return self.app
