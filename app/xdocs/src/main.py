"""xdocs — Extraction et exposition des docs embarquées dans les plugins validés.

Après validation d'un plugin, le worker Celery extrait 3 fichiers du ZIP vérifié :
  - README.md       → documentation principale
  - integration.md  → guide d'intégration
  - contributor.yaml → métadonnées contributeurs

Les contenus sont persistés en DB et exposés via les routes :
  GET /plugins/{slug}/docs
  GET /plugins/{slug}/versions/{version}/docs
"""

from __future__ import annotations

import logging

from pathlib import Path

from fastapi import APIRouter
from xcore.sdk import AutoDispatchMixin, TrustedBase
from xcore.services.database.migrations import MigrationRunner

from .models import Base
from .routes.docs import docs_router

logger = logging.getLogger("hub.xdocs")


class Plugin(AutoDispatchMixin, TrustedBase):
    async def on_load(self) -> None:
        self.app = APIRouter()

        db = self.get_service("db")
        self._db = db

        # ── Migrations ───────────────────────────────────────────────────────
        async with db.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("[xdocs] Tables créées / vérifiées")
        _migrations_dir = Path(__file__).parent.parent / "migrations"
        runner = MigrationRunner(db_url=str(db.engine.url), migrations_dir=_migrations_dir)
        try:
            await runner.upgrade()
        except Exception as exc:
            logger.warning("[xdocs] Migration upgrade ignorée : %s", exc)

        self.app.include_router(docs_router(db))
        logger.info("[xdocs] Prêt — /plugins/{slug}/docs")

    async def on_unload(self) -> None:
        logger.info("[xdocs] Déchargé")

    def get_router(self) -> APIRouter | None:
        return self.app
