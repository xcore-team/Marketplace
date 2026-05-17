"""
Extension xmailproxy — Proxy Redis → email pour le marketplace.

Le worker Celery (processus séparé, sans accès à get_service) publie les
events email sur le channel Redis "marketplace.email". Cette extension,
qui tourne dans le processus API, souscrit à ce channel et dispatche via
MarketplaceEmailService + ext.email.

Ajout dans integration.yaml :
    extensions:
      mail_proxy:
        module: extensions.xmailproxy.main:MailProxyService
        config:
          redis_url: redis://localhost:6379/0
          admin_emails:
            - admin@xcore.io

Depuis le plugin marketplace (on_load) :
    proxy = self.get_service("ext.mail_proxy")
    proxy.wire(self.get_service("ext.email"))

Format du message Redis (JSON) :
    {
        "action": "pipeline_approved",   # voir ACTIONS ci-dessous
        "to": "dev@ex.com",             # destinataire développeur
        "developer_name": "Alice",
        "plugin_name": "my-plugin",
        "plugin_version": "1.0.0",
        "submission_id": "uuid",
        "anomaly_score": 12,            # optionnel selon l'action
        "rejection_reason": "...",      # optionnel
        "source": "upload"              # optionnel (admin_new_submission)
    }
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from xcore.services.base import BaseService, ServiceStatus

logger = logging.getLogger("xcore.mail_proxy")

CHANNEL = "marketplace.email"

# Actions qui envoient aussi un email aux admins (en plus du dev)
_ADMIN_ACTIONS = {
    "pipeline_approved": "admin_approved",
    "pipeline_rejected": "admin_rejected",
    "pipeline_manual_review": "admin_manual_review",
    "admin_new_submission": None,   # action admin pure, pas de doublon
    "admin_approved": None,
    "admin_rejected": None,
    "admin_manual_review": None,
}


class MailProxyService(BaseService):
    """
    Service proxy qui bridge le channel Redis "marketplace.email"
    vers MarketplaceEmailService (ext.email).
    """

    name = "mail_proxy"

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__()
        self._redis_url: str = config.get("redis_url", "redis://localhost:6379/0")
        self._admin_emails: list[str] = config.get("admin_emails", [])
        self._email_ext: Any = None
        self._redis: Any = None
        self._task: asyncio.Task | None = None

    # ── Wiring ────────────────────────────────────────────────────────────────

    def wire(self, email_ext: Any) -> None:
        """Appelé par le plugin marketplace en on_load() pour connecter ext.email."""
        self._email_ext = email_ext
        logger.info("[mail_proxy] email_ext connecté → %s", type(email_ext).__name__)

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def init(self) -> None:
        self._status = ServiceStatus.INITIALIZING
        try:
            from redis.asyncio import from_url
            self._redis = from_url(self._redis_url, decode_responses=True)
            await self._redis.ping()
            self._task = asyncio.create_task(self._listen(), name="mail_proxy_listener")
            self._status = ServiceStatus.READY
            logger.info("[mail_proxy] Prêt — écoute '%s' sur %s", CHANNEL, self._redis_url)
        except Exception as exc:
            self._status = ServiceStatus.DEGRADED
            logger.error("[mail_proxy] Init échoué : %s", exc)

    async def shutdown(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._redis:
            await self._redis.aclose()
        self._status = ServiceStatus.STOPPED
        logger.info("[mail_proxy] Arrêté")

    async def health_check(self) -> tuple[bool, str]:
        if not self._redis:
            return False, "Redis non connecté"
        try:
            await self._redis.ping()
            wired = self._email_ext is not None
            return True, f"Redis OK — email_ext {'connecté' if wired else 'non connecté'}"
        except Exception as exc:
            return False, f"Redis inaccessible : {exc}"

    def status(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "status": self._status.value,
            "channel": CHANNEL,
            "redis_url": self._redis_url,
            "admin_emails": self._admin_emails,
            "email_ext_wired": self._email_ext is not None,
            "listener_running": self._task is not None and not self._task.done(),
        }

    # ── Listener ──────────────────────────────────────────────────────────────

    async def _listen(self) -> None:
        """Boucle principale — subscribe au channel Redis et dispatche les events."""
        pubsub = self._redis.pubsub()
        await pubsub.subscribe(CHANNEL)
        logger.debug("[mail_proxy] Souscrit à '%s'", CHANNEL)

        try:
            while True:
                try:
                    msg = await pubsub.get_message(
                        ignore_subscribe_messages=True,
                        timeout=1.0,
                    )
                    if msg and msg["type"] == "message":
                        try:
                            data = json.loads(msg["data"])
                        except json.JSONDecodeError:
                            logger.warning("[mail_proxy] Message non-JSON ignoré : %s", msg["data"])
                            continue
                        asyncio.create_task(self._dispatch(data))
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    logger.error("[mail_proxy] Erreur dans la boucle listener : %s", exc)
                    await asyncio.sleep(1)
        finally:
            await pubsub.unsubscribe(CHANNEL)
            await pubsub.close()

    # ── Dispatch ──────────────────────────────────────────────────────────────

    async def _dispatch(self, data: dict) -> None:
        if not self._email_ext:
            logger.warning("[mail_proxy] email_ext non connecté — event ignoré : %s", data.get("action"))
            return

        from app.marketplace.src.services.email import MarketplaceEmailService
        svc = MarketplaceEmailService(self._email_ext)

        action = data.get("action", "")
        try:
            await self._send_developer(svc, action, data)
            await self._send_admin(svc, action, data)
        except Exception as exc:
            logger.error("[mail_proxy] Dispatch échoué (action=%s) : %s", action, exc)

    async def _send_developer(self, svc: Any, action: str, d: dict) -> None:
        to = d.get("to")
        if not to:
            return

        kwargs = {
            "to": to,
            "developer_name": d.get("developer_name", to.split("@")[0]),
            "plugin_name": d.get("plugin_name", ""),
            "plugin_version": d.get("plugin_version", ""),
            "submission_id": d.get("submission_id", ""),
        }

        match action:
            case "submission_received":
                await svc.submission_received(**kwargs)
            case "pipeline_approved":
                await svc.pipeline_approved(**kwargs, anomaly_score=d.get("anomaly_score", 0))
            case "pipeline_rejected":
                await svc.pipeline_rejected(**kwargs, anomaly_score=d.get("anomaly_score", 0), rejection_reason=d.get("rejection_reason", ""))
            case "pipeline_manual_review":
                await svc.pipeline_manual_review(**kwargs, anomaly_score=d.get("anomaly_score", 0))
            case "pipeline_failed":
                await svc.pipeline_failed(**kwargs)
            case _:
                pass  # action admin pure, pas d'email développeur

    async def _send_admin(self, svc: Any, action: str, d: dict) -> None:
        if not self._admin_emails:
            return

        admin_action = _ADMIN_ACTIONS.get(action)

        # Actions admin directes (publiées explicitement pour les admins)
        if action in ("admin_new_submission", "admin_approved", "admin_rejected", "admin_manual_review"):
            admin_action = action

        if not admin_action:
            return

        base = {
            "to": self._admin_emails,
            "developer_name": d.get("developer_name", d.get("to", "").split("@")[0]),
            "plugin_name": d.get("plugin_name", ""),
            "plugin_version": d.get("plugin_version", ""),
            "submission_id": d.get("submission_id", ""),
        }

        match admin_action:
            case "admin_new_submission":
                await svc.admin_new_submission(
                    **base,
                    developer_email=d.get("to", d.get("developer_email", "")),
                    source=d.get("source", "upload"),
                )
            case "admin_approved":
                await svc.admin_approved(**base, anomaly_score=d.get("anomaly_score", 0))
            case "admin_rejected":
                await svc.admin_rejected(**base, anomaly_score=d.get("anomaly_score", 0), rejection_reason=d.get("rejection_reason", ""))
            case "admin_manual_review":
                await svc.admin_manual_review(
                    **base,
                    developer_email=d.get("to", d.get("developer_email", "")),
                    anomaly_score=d.get("anomaly_score", 0),
                )
