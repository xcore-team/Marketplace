"""xservices — Marketplace des extensions de service XCore."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter
from xcore.sdk import AutoDispatchMixin, TrustedBase
from xcore.services.database.migrations import MigrationRunner

from .models import Base
from .routes import (
    admin_router,
    categories_router,
    service_install_router,
    services_router,
    submissions_router,
)
from .routes.github import service_github_router

logger = logging.getLogger("hub.xservices")


class Plugin(AutoDispatchMixin, TrustedBase):
    async def on_load(self) -> None:
        self.app = APIRouter()
        db = self.get_service("db")
        events = self.ctx.events

        @self.ctx.health.register("xservices")
        async def check_health():
            return (True, "Opérationnel") if db else (False, "Base de données indisponible")

        async with db.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("[xservices] Tables créées / vérifiées")
        _migrations_dir = Path(__file__).parent.parent / "migrations"
        runner = MigrationRunner(db_url=str(db.engine.url), migrations_dir=_migrations_dir)
        try:
            await runner.upgrade()
        except Exception as exc:
            logger.warning("[xservices] Migration upgrade ignorée : %s", exc)

        secret_key = self.ctx.env.get("MARKET_SECRET_KEY", "").encode()

        # Clé maître pour déchiffrer les signing keys (partagée avec xdevkeys/marketplace)
        _devkeys_master_raw = self.ctx.env.get("DEVKEYS_MASTER_KEY", "")
        if _devkeys_master_raw:
            devkeys_master = (
                bytes.fromhex(_devkeys_master_raw)
                if len(_devkeys_master_raw) == 64
                else _devkeys_master_raw.encode()
            )
        else:
            devkeys_master = b"insecure-dev-key-change-in-prod!"
            logger.warning(
                "[xservices] DEVKEYS_MASTER_KEY absent — endpoint install dégradé"
            )

        try:
            mail_proxy = self.get_service("ext.mail_proxy")
            mail_proxy.wire(self.get_service("ext.email"))
        except Exception as exc:
            logger.warning("[xservices] mail_proxy indisponible : %s", exc)

        await self._seed_categories(db)

        self.app.include_router(categories_router(db))
        self.app.include_router(services_router(db))
        self.app.include_router(submissions_router(db, events, secret_key))
        self.app.include_router(service_github_router(db, events, secret_key, ctx=self.call_plugin))
        self.app.include_router(service_install_router(db, devkeys_master, ctx=self.call_plugin))
        self.app.include_router(admin_router(db))

        logger.info("[xservices] Prêt — /categories  /services  /submissions  /github  /install  /admin")

    async def _seed_categories(self, db) -> None:
        _DEFAULT_CATEGORIES = [
            ("Email", "Services d'envoi et gestion d'emails"),
            ("Storage", "Stockage de fichiers, S3, CDN"),
            ("Payment", "Passerelles de paiement et facturation"),
            ("Notification", "Push, SMS, alertes temps réel"),
            ("Database", "Connecteurs de bases de données"),
            ("Auth", "Authentification et gestion des identités"),
            ("Cache", "Systèmes de cache distribué"),
            ("Queue", "Files de messages et brokers"),
            ("Monitoring", "Logs, métriques et observabilité"),
            ("AI", "Modèles IA et services d'inférence"),
            ("Search", "Moteurs de recherche et indexation"),
            ("Utilities", "Services utilitaires divers"),
        ]
        try:
            from .services.category import CategoryService
            async with db.session() as session:
                svc = CategoryService(session)
                existing = {c.name for c in await svc.list_all()}
                created = 0
                for name, description in _DEFAULT_CATEGORIES:
                    if name not in existing:
                        await svc.create(name=name, description=description)
                        created += 1
                if created:
                    await session.commit()
                    logger.info("[xservices] %d catégorie(s) créée(s)", created)
        except Exception as exc:
            logger.warning("[xservices] Seed catégories échoué : %s", exc)

    async def on_unload(self) -> None:
        logger.info("[xservices] Déchargé")

    def get_router(self) -> APIRouter | None:
        return self.app
