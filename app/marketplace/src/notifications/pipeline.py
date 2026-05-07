from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from extensions.mail.main import EmailService

logger = logging.getLogger("hub.marketplace.notifications")

_BASE_STYLE = (
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;"
    "max-width:600px;margin:auto;padding:32px 20px;color:#1f2937;"
)
_FOOTER = (
    "<hr style='border:none;border-top:1px solid #e5e7eb;margin:32px 0;'>"
    "<p style='color:#9ca3af;font-size:12px;text-align:center;'>xcore-market</p>"
)


def _html(title: str, color: str, body_html: str) -> str:
    return (
        f"<!DOCTYPE html><html><head><meta charset='utf-8'></head>"
        f"<body style='{_BASE_STYLE}'>"
        f"<h2 style='color:{color};'>{title}</h2>"
        f"{body_html}{_FOOTER}</body></html>"
    )


class NotificationPipeline:
    def __init__(
        self, email_service: "EmailService | None", app_name: str = "xcore-market"
    ):
        self._email = email_service
        self._app = app_name

    def on_received(self, to: str, plugin_name: str, submission_id: str) -> None:
        self._queue(
            to=to,
            subject=f"[{self._app}] Soumission reçue — {plugin_name}",
            body=_html(
                "Soumission reçue",
                "#2563eb",
                f"<p>Votre soumission pour <strong>{plugin_name}</strong> est en cours de validation.</p>"
                f"<p style='color:#6b7280;font-size:13px;'>ID : <code>{submission_id}</code></p>",
            ),
        )

    def on_approved(
        self, to: str, plugin_name: str, version: str, submission_id: str
    ) -> None:
        self._queue(
            to=to,
            subject=f"[{self._app}] ✅ Plugin approuvé — {plugin_name} v{version}",
            body=_html(
                "Plugin approuvé ✅",
                "#059669",
                f"<p><strong>{plugin_name} v{version}</strong> est maintenant disponible sur le marketplace.</p>"
                f"<p style='color:#6b7280;font-size:13px;'>ID : <code>{submission_id}</code></p>",
            ),
        )

    def on_rejected(
        self, to: str, plugin_name: str, version: str, score: int, submission_id: str
    ) -> None:
        self._queue(
            to=to,
            subject=f"[{self._app}] ❌ Plugin rejeté — {plugin_name} v{version}",
            body=_html(
                "Plugin rejeté ❌",
                "#dc2626",
                f"<p><strong>{plugin_name} v{version}</strong> n'a pas passé la validation (score : {score}).</p>"
                f"<p>Consultez le rapport dans votre tableau de bord.</p>"
                f"<p style='color:#6b7280;font-size:13px;'>ID : <code>{submission_id}</code></p>",
            ),
        )

    def on_manual_review(
        self, to: str, plugin_name: str, version: str, score: int, submission_id: str
    ) -> None:
        self._queue(
            to=to,
            subject=f"[{self._app}] ⚠️ Révision manuelle — {plugin_name} v{version}",
            body=_html(
                "Révision manuelle requise ⚠️",
                "#d97706",
                f"<p><strong>{plugin_name} v{version}</strong> nécessite une révision manuelle (score : {score}).</p>"
                f"<p style='color:#6b7280;font-size:13px;'>ID : <code>{submission_id}</code></p>",
            ),
        )

    def on_auto_published(
        self, admin_email: str, plugin_name: str, version: str, score: int
    ) -> None:
        """Notifie l'admin qu'un plugin a été publié automatiquement."""
        self._queue(
            to=admin_email,
            subject=f"[{self._app}] ✅ Publication auto — {plugin_name} v{version}",
            body=_html(
                "Plugin publié automatiquement ✅",
                "#059669",
                f"<p><strong>{plugin_name} v{version}</strong> a été publié automatiquement "
                f"(score d'anomalie : <strong>{score}</strong> ≤ 30).</p>"
                f"<p>Aucune action requise.</p>",
            ),
        )

    def on_manual_review_admin(
        self, admin_email: str, plugin_name: str, version: str, score: int
    ) -> None:
        """Notifie l'admin qu'un plugin nécessite une revue manuelle."""
        self._queue(
            to=admin_email,
            subject=f"[{self._app}] ⚠️ Revue requise — {plugin_name} v{version}",
            body=_html(
                "Revue manuelle requise ⚠️",
                "#d97706",
                f"<p><strong>{plugin_name} v{version}</strong> a un score d'anomalie de "
                f"<strong>{score}</strong> (seuil : 30).</p>"
                f"<p>Connectez-vous au panneau d'administration pour approuver ou rejeter ce plugin.</p>",
            ),
        )

    def _queue(self, to: str, subject: str, body: str) -> None:
        if self._email is None:
            logger.info(f"[notif simulée] To={to} | {subject}")
            return
        if not self._email.queue(to=to, subject=subject, body=body, is_html=True):
            logger.warning(f"[notif] File pleine — email non envoyé à {to}")
