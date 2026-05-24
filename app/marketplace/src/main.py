"""marketplace/src/main.py — Plugin xcore Marketplace."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Request, WebSocket
from xcore.sdk import AutoDispatchMixin, TrustedBase
from xcore.services.database.migrations import MigrationRunner

from sandbox import SandboxLimits

from .ipc import IPCCommands
from .models import Base
from .routes import (
    categories_router,
    github_router,
    install_router,
    plugins_router,
    submissions_router,
    webhooks_router,
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
            return (
                (True, "Opérationnel")
                if db
                else (False, "Base de données indisponible")
            )

        # ── Migrations ───────────────────────────────────────────────────────
        async with db.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("[marketplace] Tables créées / vérifiées")
        _migrations_dir = Path(__file__).parent.parent / "migrations"
        runner = MigrationRunner(
            db_url=str(db.engine.url), migrations_dir=_migrations_dir
        )
        try:
            await runner.upgrade()
        except Exception as exc:
            logger.warning("[marketplace] Migration upgrade ignorée : %s", exc)

        # ── Config sandbox ────────────────────────────────────────────────────
        secret_key = env.get("MARKET_SECRET_KEY", "").encode()

        # Clé maître pour déchiffrer les signing keys (partagée avec xdevkeys)
        _devkeys_master_raw = env.get("DEVKEYS_MASTER_KEY", "")
        if _devkeys_master_raw:
            devkeys_master = (
                bytes.fromhex(_devkeys_master_raw)
                if len(_devkeys_master_raw) == 64
                else _devkeys_master_raw.encode()
            )
        else:
            devkeys_master = b"insecure-dev-key-change-in-prod!"
            logger.warning(
                "[marketplace] DEVKEYS_MASTER_KEY absent — endpoint install dégradé"
            )
        limits = SandboxLimits(
            memory_mb=int(env.get("SANDBOX_MEMORY_MB", "128")),
            cpu_seconds=int(env.get("SANDBOX_CPU_SECONDS", "10")),
            timeout=int(env.get("SANDBOX_TIMEOUT", "30")),
        )
        logger.info(
            "[marketplace] Sandbox — mem=%dMB cpu=%ds timeout=%ds",
            limits.memory_mb,
            limits.cpu_seconds,
            limits.timeout,
        )

        # ── Mail proxy ────────────────────────────────────────────────────────
        try:
            mail_proxy = self.get_service("ext.mail_proxy")
            mail_proxy.wire(self.get_service("ext.email"))
        except Exception as exc:
            logger.warning("[marketplace] mail_proxy indisponible : %s", exc)

        # ── WebSocket ─────────────────────────────────────────────────────────
        try:
            ws_manager = self.get_service("ext.web_socket")
        except Exception:
            ws_manager = None
            logger.warning("[marketplace] ext.web_socket indisponible")

        # ── Seed catégories ───────────────────────────────────────────────────
        await self._seed_categories(db)

        # ── Routes ────────────────────────────────────────────────────────────
        self.app.include_router(categories_router(db))
        self.app.include_router(plugins_router(db, ctx=self.call_plugin))
        self.app.include_router(submissions_router(db, events, secret_key, limits))
        self.app.include_router(github_router(db, events, secret_key, limits))
        self.app.include_router(webhooks_router(db))
        self.app.include_router(install_router(db, devkeys_master))

        # ── Route WebSocket ───────────────────────────────────────────────────
        if ws_manager:

            @self.app.websocket("/ws/{channel}")
            async def ws_endpoint(ws: WebSocket, channel: str, request: Request):
                await ws_manager.ws_endpoint(ws=ws, request=request, channel=channel)

            logger.info(
                "[marketplace] WebSocket actif — canaux : %s",
                ws_manager.configuration.channel,
            )

        logger.info(
            "[marketplace] Prêt — /categories  /plugins  /submissions  /github  /ws (admin → /app/xadmin)"
        )

    async def _seed_categories(self, db) -> None:
        _DEFAULT_CATEGORIES = [
            ("Analytics", "Outils d'analyse de données et de métriques"),
            (
                "Authentication",
                "Authentification, autorisation et gestion des identités",
            ),
            ("Communication", "Email, SMS, notifications push et messagerie"),
            ("Database", "Connecteurs, ORM et outils de base de données"),
            ("DevTools", "Outils de développement, debug et productivité"),
            ("E-commerce", "Paiements, paniers et gestion des commandes"),
            ("File Storage", "Stockage de fichiers, CDN et gestion des assets"),
            ("Integration", "Intégrations tierces, webhooks et API externes"),
            ("Monitoring", "Logs, métriques, alertes et observabilité"),
            ("Security", "Chiffrement, audit et sécurité applicative"),
            ("UI Components", "Composants d'interface et widgets frontend"),
            ("Utilities", "Utilitaires généraux et helpers divers"),
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
                    logger.info("[marketplace] %d catégorie(s) créée(s)", created)
        except Exception as exc:
            logger.warning("[marketplace] Seed catégories échoué : %s", exc)

    async def on_unload(self) -> None:
        logger.info("[marketplace] Déchargé")

    def get_router(self) -> APIRouter | None:
        return self.app
