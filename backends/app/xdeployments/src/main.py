"""xdeployments — Statut de déploiement rapporté par xcore-agent."""

from __future__ import annotations

import logging

from fastapi import APIRouter
from xcore.sdk import AutoDispatchMixin, TrustedBase

from .ipc import IPCCommands
from .models import Base
from .routes import deployments_router

logger = logging.getLogger("hub.xdeployments")


class Plugin(IPCCommands, AutoDispatchMixin, TrustedBase):
    async def on_load(self) -> None:
        self.app = APIRouter()
        db = self.get_service("db")
        self._db = db

        @self.ctx.health.register("xdeployments")
        async def check_health():
            return (
                (True, "Opérationnel")
                if db
                else (False, "Base de données indisponible")
            )

        async with db.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("[xdeployments] Tables créées / vérifiées")

        self.app.include_router(deployments_router(db, ctx=self.call_plugin))

        logger.info("[xdeployments] Prêt — /deployments")

    async def on_unload(self) -> None:
        logger.info("[xdeployments] Déchargé")

    def get_router(self) -> APIRouter | None:
        return self.app
