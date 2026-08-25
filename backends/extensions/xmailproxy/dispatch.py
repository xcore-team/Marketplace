"""
Dispatch générique — route les messages vers des handlers enregistrés par action.
"""

from __future__ import annotations

from typing import Any, Callable

from xcore.sdk import get_logger

from .constants import MARKETPLACE_TEMPLATES, NOTIFY_ADMIN

logger = get_logger("xcore.mail_proxy")


class DispatchMixin:
    """
    Mixin de dispatch générique.

    Supporte :
      - handlers enregistrés via register_handler(action, callable)
      - rétrocompatibilité email (to + html/text, template, action marketplace)

    Attend que la classe hôte expose :
        - self._email_ext
        - self._admin_emails
    """

    _email_ext: Any
    _admin_emails: list[str]
    _handlers: dict[str, Callable[[dict], Any]] = {}

    def register_handler(self, action: str, handler: Callable[[dict], Any]) -> None:
        self._handlers[action] = handler
        logger.debug("[mail_proxy] Handler enregistré : %s", action)

    async def _dispatch(self, data: dict) -> None:
        try:
            # Priorité 1 : handler enregistré pour l'action
            action = data.get("action", "")
            handler = self._handlers.get(action)
            if handler:
                result = handler(data)
                if hasattr(result, "__await__"):
                    await result
                return

            # Priorité 2 : rétrocompatibilité email
            if data.get("to") and (data.get("html") or data.get("text")):
                await self._send_direct(data)
                return

            if data.get("template"):
                await self._send_via_template(data)
                return

            if action in MARKETPLACE_TEMPLATES:
                await self._send_marketplace(action, data)
                return

            logger.warning(
                "[mail_proxy] Message ignoré — ni handler, ni format email : %s",
                data,
            )

        except Exception as exc:
            logger.error("[mail_proxy] Dispatch échoué : %s", exc)

    async def _send_direct(self, data: dict) -> None:
        if not self._email_ext:
            logger.warning("[mail_proxy] ext.email non connecté")
            return
        to = data["to"]
        subject = data.get("subject", "(sans objet)")
        html = data.get("html")
        text = data.get("text", "")
        if html:
            await self._email_ext.send(to=to, subject=subject, body=html, is_html=True)
        else:
            await self._email_ext.send(to=to, subject=subject, body=text, is_html=False)
        logger.debug("[mail_proxy] Envoi direct → %s | %s", to, subject)

    async def _send_via_template(self, data: dict) -> None:
        if not self._email_ext:
            logger.warning("[mail_proxy] ext.email non connecté")
            return
        to = data["to"]
        template = data["template"]
        context = data.get("context", {})
        subject = data.get("subject")
        await self._email_ext.send_template(
            to=to, template=template, context=context, subject=subject
        )
        logger.debug("[mail_proxy] Template '%s' → %s", template, to)

    async def _send_marketplace(self, action: str, data: dict) -> None:
        if not self._email_ext:
            logger.warning("[mail_proxy] ext.email non connecté")
            return
        to = data.get("to")
        template = MARKETPLACE_TEMPLATES[action]
        context = {
            "developer_name":  data.get("developer_name", (to or "").split("@")[0]),
            "plugin_name":     data.get("plugin_name", ""),
            "plugin_version":  data.get("plugin_version", ""),
            "submission_id":   data.get("submission_id", ""),
            "anomaly_score":   data.get("anomaly_score", 0),
            "rejection_reason": data.get("rejection_reason", ""),
            "developer_email": data.get("to", data.get("developer_email", "")),
            "source":          data.get("source", "upload"),
        }

        admin_actions = {
            "admin_new_submission",
            "admin_approved",
            "admin_rejected",
            "admin_manual_review",
        }

        if to and action not in admin_actions:
            await self._email_ext.send_template(to=to, template=template, context=context)

        if self._admin_emails and action in NOTIFY_ADMIN | admin_actions:
            admin_template = MARKETPLACE_TEMPLATES.get(f"admin_{action}", template)
            await self._email_ext.send_template(
                to=self._admin_emails, template=admin_template, context=context
            )

        logger.debug("[mail_proxy] Action marketplace '%s' → %s", action, to)
