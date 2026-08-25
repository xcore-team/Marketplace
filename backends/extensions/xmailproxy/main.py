"""
Extension xmailproxy — Proxy Redis + bus xcore générique.

Écoute un ou plusieurs canaux Redis/ PubSub ET les événements du bus xcore,
puis dispatche vers des handlers enregistrés par action.

Handlers intégrés (rétrocompatibilité) :
  - email : to + html/text, template, actions marketplace

Handlers externes enregistrés via register_handler(action, callable) depuis
le on_load() du plugin appelant.

Configuration dans integration.yaml :
    extensions:
      mail_proxy:
        module: extensions.xcoreMailproxy.main:MailProxyService
        config:
          redis_url: redis://localhost:6379/0
          channels:
            - marketplace.email
            - branch.worker
          bus_events:
            - xform.send_email
          admin_emails:
            - admin@xcore.io

Format du message (Redis ou bus) :
    {
        "action": "branch.migrate_users",
        "tenant_id": "...",
        "from_branch_id": "...",
        "to_branch_id": "..."
    }
"""

from __future__ import annotations

import asyncio
from typing import Any

from xcore.services.base import BaseService, ServiceStatus
from xcore.sdk import get_logger

from .dispatch import DispatchMixin
from .listeners import ListenersMixin

logger = get_logger("xcore.mail_proxy")


class MailProxyService(BaseService, DispatchMixin, ListenersMixin):
    """
    Proxy Redis / PubSub / bus xcore générique.

    - Écoute N canaux Redis/ PubSub en parallèle.
    - S'abonne aux events du bus xcore via handle_bus_event().
    - Dispatche chaque message vers le handler enregistré pour l'action.
    - Rétrocompatibilité email (to + html/text, template, marketplace).
    """

    name = "mail_proxy"

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__()
        self._redis_url: str = config.get("redis_url", "redis://localhost:6379/0")
        self._channels: list[str] = config.get("channels", ["marketplace.email"])
        self._bus_events: list[str] = config.get("bus_events", [])
        self._admin_emails: list[str] = config.get("admin_emails", [])
        self._handlers: dict[str, Any] = {}
        self._email_ext: Any = None
        self._pubsub_ext: Any = None   # ext.pubsub (prioritaire sur Redis direct)
        self._redis: Any = None
        self._listener_tasks: list[asyncio.Task] = []

    # ── Wiring ────────────────────────────────────────────────────────────────

    def wire(self, email_ext: Any) -> None:
        """Connecte ext.email. Appelé par le plugin parent en on_load()."""
        self._email_ext = email_ext
        logger.info("[mail_proxy] ext.email connecté → %s", type(email_ext).__name__)

    def wire_service(self, name: str, service: Any) -> None:
        """Connecte n'importe quel service xcore. Utilisé par les plugins tiers."""
        setattr(self, f"_{name}", service)
        logger.info("[mail_proxy] Service '%s' connecté → %s", name, type(service).__name__)

    def register_handler(self, action: str, handler: Any) -> None:
        """Enregistre un handler pour une action. Utilisé par les plugins tiers."""
        self._handlers[action] = handler
        logger.info("[mail_proxy] Handler enregistré : %s", action)

    def wire_pubsub(self, pubsub_ext: Any) -> None:
        """
        Connecte ext.pubsub après init(). Bascule les listeners Redis → pubsub.

            proxy.wire_pubsub(self.get_service("ext.pubsub"))

        Peut être appelé après init() — le basculement se fait en tâche de fond.
        """
        self._pubsub_ext = pubsub_ext
        logger.info(
            "[mail_proxy] ext.pubsub connecté → provider=%s",
            getattr(getattr(pubsub_ext, "conf", None), "provider", "?"),
        )
        # Basculer vers ext.pubsub si init() a déjà démarré les listeners Redis
        asyncio.create_task(self._switch_to_pubsub(), name="mail_proxy_switch_pubsub")

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def init(self) -> None:
        self._status = ServiceStatus.INITIALIZING
        try:
            if self._pubsub_ext:
                # Mode ext.pubsub — une tâche par canal
                for channel in self._channels:
                    task = asyncio.create_task(
                        self._listen_pubsub(channel),
                        name=f"mail_proxy_listener_{channel}",
                    )
                    self._listener_tasks.append(task)
                logger.info(
                    "[mail_proxy] Prêt (ext.pubsub) — canaux=%s bus_events=%s",
                    self._channels, self._bus_events,
                )
            else:
                # Mode Redis direct — fallback
                from redis.asyncio import from_url
                self._redis = from_url(self._redis_url, decode_responses=True)
                await self._redis.ping()
                task = asyncio.create_task(
                    self._listen_redis(), name="mail_proxy_listener_redis"
                )
                self._listener_tasks.append(task)
                logger.info(
                    "[mail_proxy] Prêt (Redis direct) — canaux=%s bus_events=%s",
                    self._channels, self._bus_events,
                )
            self._status = ServiceStatus.READY
        except Exception as exc:
            self._status = ServiceStatus.DEGRADED
            logger.error("[mail_proxy] Init échoué : %s", exc)

    async def shutdown(self) -> None:
        for task in self._listener_tasks:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        self._listener_tasks.clear()
        if self._redis:
            await self._redis.aclose()
        self._status = ServiceStatus.STOPPED
        logger.info("[mail_proxy] Arrêté")

    async def health_check(self) -> tuple[bool, str]:
        wired = self._email_ext is not None
        if self._pubsub_ext:
            ok, msg = await self._pubsub_ext.health_check()
            return ok, f"pubsub: {msg} — email_ext {'connecté' if wired else 'non connecté'}"
        if not self._redis:
            return False, "Redis non connecté"
        try:
            await self._redis.ping()
            return True, f"Redis OK — email_ext {'connecté' if wired else 'non connecté'}"
        except Exception as exc:
            return False, f"Redis inaccessible : {exc}"

    def status(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "status": self._status.value,
            "mode": "pubsub" if self._pubsub_ext else "redis_direct",
            "channels": self._channels,
            "bus_events": self._bus_events,
            "redis_url": self._redis_url if not self._pubsub_ext else None,
            "admin_emails": self._admin_emails,
            "email_ext_wired": self._email_ext is not None,
            "pubsub_ext_wired": self._pubsub_ext is not None,
            "listeners_running": sum(1 for t in self._listener_tasks if not t.done()),
        }

    # ── Bus xcore ─────────────────────────────────────────────────────────────

    async def handle_bus_event(self, event_name: str, data: dict) -> None:
        """
        Point d'entrée pour les events du bus xcore.
        À brancher depuis on_load() du plugin parent :

            proxy = self.get_service("ext.mail_proxy")
            self.ctx.events.on("xform.send_email", lambda e: proxy.handle_bus_event(
                getattr(e, "name", ""), getattr(e, "data", e) if not isinstance(e, dict) else e
            ))
        """
        if event_name not in self._bus_events:
            return
        logger.debug("[mail_proxy] Bus event reçu : %s", event_name)
        asyncio.create_task(self._dispatch(data))

    # ── Switch listeners ──────────────────────────────────────────────────────

    async def _switch_to_pubsub(self) -> None:
        """Annule les listeners Redis et démarre les listeners ext.pubsub."""
        for task in self._listener_tasks:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
        self._listener_tasks.clear()

        if self._redis:
            await self._redis.aclose()
            self._redis = None

        for channel in self._channels:
            task = asyncio.create_task(
                self._listen_pubsub(channel),
                name=f"mail_proxy_pubsub_{channel}",
            )
            self._listener_tasks.append(task)

        logger.info("[mail_proxy] Basculé vers ext.pubsub — canaux=%s", self._channels)