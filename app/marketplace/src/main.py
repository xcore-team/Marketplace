"""marketplace/src/main.py — Plugin xcore Marketplace."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request, WebSocket
from xcore.sdk import AutoDispatchMixin, TrustedBase

from sandbox import SandboxLimits

from .ipc import IPCCommands
from .models import Base
from .routes import (
    admin_router,
    categories_router,
    github_router,
    plugins_router,
    submissions_router,
)

logger = logging.getLogger("hub.marketplace")


class Plugin(IPCCommands, AutoDispatchMixin, TrustedBase):
    """
    Plugin xcore — Marketplace de plugins.

    Permissions RBAC utilisées dans les routes :
    - plugins:write      — créer / supprimer un plugin
    - submissions:write  — soumettre un ZIP ou publier depuis GitHub
    """

    async def on_load(self) -> None:
        self.app = APIRouter()

        env = self.ctx.env
        db = self.get_service("db")
        self._db = db
        events = self.ctx.events

        @self.ctx.health.register("marketplace")
        async def check_health():
            try:
                mail = self.get_service("ext.email")
            except Exception:
                mail = None
            if db and mail:
                return True, "Tous les services sont opérationnels"
            return False, "Un ou plusieurs services sont indisponibles"

        # ── Tables ───────────────────────────────────────────────────────────
        async with db.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("[marketplace] Tables créées / vérifiées")

        # ── Config sandbox ────────────────────────────────────────────────────
        secret_key = env.get("MARKET_SECRET_KEY", "").encode()
        limits = SandboxLimits(
            memory_mb=int(env.get("SANDBOX_MEMORY_MB", "128")),
            cpu_seconds=int(env.get("SANDBOX_CPU_SECONDS", "10")),
            timeout=int(env.get("SANDBOX_TIMEOUT", "30")),
        )
        logger.info(
            "[marketplace] Sandbox — mem=%dMB cpu=%ds timeout=%ds",
            limits.memory_mb, limits.cpu_seconds, limits.timeout,
        )

        # ── WebSocket ─────────────────────────────────────────────────────────
        try:
            ws_manager = self.get_service("ext.web_socket")
        except Exception:
            ws_manager = None
            logger.warning("[marketplace] ext.web_socket indisponible")

        # ── Routes ────────────────────────────────────────────────────────────
        self.app.include_router(admin_router(db, events))
        self.app.include_router(categories_router(db))
        self.app.include_router(plugins_router(db))
        self.app.include_router(submissions_router(db, events, secret_key, limits))
        self.app.include_router(github_router(db, events, secret_key, limits))

        # ── Route WebSocket ───────────────────────────────────────────────────
        if ws_manager:
            @self.app.websocket("/ws/{channel}")
            async def ws_endpoint(ws: WebSocket, channel: str, request: Request):
                await ws_manager.ws_endpoint(ws=ws, request=request, channel=channel)

            logger.info("[marketplace] WebSocket actif — canaux : %s", ws_manager.configuration.channel)

        logger.info("[marketplace] Prêt — /categories  /plugins  /submissions  /github  /ws")

    async def on_unload(self) -> None:
        logger.info("[marketplace] Déchargé")

    def get_router(self) -> APIRouter | None:
        return self.app
