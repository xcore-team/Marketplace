"""xadmin — Panneau d'administration global XCore Market.

Centralise la gestion de toutes les ressources de la plateforme :
  - Utilisateurs (ban, rôles, suppression)
  - Plugins (publication, suppression, yank de versions)
  - Soumissions (forcer un statut)
  - Catégories (CRUD)
  - Audit logs
  - Stats globales
  - Broadcast de messages
  - Infos système et DB

Toutes les routes requièrent au minimum la permission admin:* sauf
les routes spécialisées qui utilisent leurs permissions dédiées.

Préfixe : /app/xadmin/admin
"""

from __future__ import annotations

import logging

from fastapi import APIRouter
from xcore.sdk import AutoDispatchMixin, TrustedBase

from .routes import (
    audit_router,
    categories_router,
    plugins_router,
    stats_router,
    submissions_router,
    system_router,
    users_router,
)

logger = logging.getLogger("hub.xadmin")


class Plugin(AutoDispatchMixin, TrustedBase):
    async def on_load(self) -> None:
        self.app = APIRouter()

        db = self.get_service("db")
        events = self.ctx.events

        self.app.include_router(users_router(db))
        self.app.include_router(plugins_router(db, events))
        self.app.include_router(submissions_router(db, events))
        self.app.include_router(categories_router(db))
        self.app.include_router(stats_router(db, events))
        self.app.include_router(audit_router(db))
        self.app.include_router(system_router(db))

        logger.info(
            "[xadmin] Prêt — /admin/users  /admin/plugins  /admin/submissions  "
            "/admin/categories  /admin/stats  /admin/audit  /admin/system"
        )

    async def on_unload(self) -> None:
        logger.info("[xadmin] Déchargé")

    def get_router(self) -> APIRouter | None:
        return self.app
