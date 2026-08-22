from __future__ import annotations

from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

_TEMPLATES_DIR = Path(__file__).parents[2] / "data" / "templates"


class MarketplaceEmailService:
    """
    Rend les 9 templates Jinja2 du marketplace et les envoie via ext.email.

    Usage depuis un plugin XCore :
        email_ext = self.get_service("ext.email")
        svc = MarketplaceEmailService(email_ext)
        await svc.submission_received(to="dev@ex.com", ...)
    """

    def __init__(self, email_ext: Any) -> None:
        self._ext = email_ext
        self._jinja = Environment(
            loader=FileSystemLoader(str(_TEMPLATES_DIR)),
            autoescape=select_autoescape(["html"]),
        )

    def _render(self, template_name: str, ctx: dict) -> str:
        return self._jinja.get_template(f"{template_name}.html").render(**ctx)

    async def _send(self, to: str, subject: str, html: str) -> bool:
        return await self._ext.send(to=to, subject=subject, body=html, is_html=True)

    # ── Emails développeur ────────────────────────────────────────────────────

    async def submission_received(
        self,
        to: str,
        developer_name: str,
        plugin_name: str,
        plugin_version: str,
        submission_id: str,
    ) -> bool:
        html = self._render("submission_received", {
            "developer_name": developer_name,
            "plugin_name": plugin_name,
            "plugin_version": plugin_version,
            "submission_id": submission_id,
        })
        return await self._send(to, f"[{plugin_name}] Soumission reçue — en traitement", html)

    async def pipeline_approved(
        self,
        to: str,
        developer_name: str,
        plugin_name: str,
        plugin_version: str,
        submission_id: str,
        anomaly_score: int,
    ) -> bool:
        html = self._render("pipeline_approved", {
            "developer_name": developer_name,
            "plugin_name": plugin_name,
            "plugin_version": plugin_version,
            "submission_id": submission_id,
            "anomaly_score": anomaly_score,
        })
        return await self._send(to, f"[{plugin_name}] Plugin approuvé et publié 🎉", html)

    async def pipeline_rejected(
        self,
        to: str,
        developer_name: str,
        plugin_name: str,
        plugin_version: str,
        submission_id: str,
        anomaly_score: int,
        rejection_reason: str,
    ) -> bool:
        html = self._render("pipeline_rejected", {
            "developer_name": developer_name,
            "plugin_name": plugin_name,
            "plugin_version": plugin_version,
            "submission_id": submission_id,
            "anomaly_score": anomaly_score,
            "rejection_reason": rejection_reason,
        })
        return await self._send(to, f"[{plugin_name}] Soumission rejetée", html)

    async def pipeline_manual_review(
        self,
        to: str,
        developer_name: str,
        plugin_name: str,
        plugin_version: str,
        submission_id: str,
        anomaly_score: int,
    ) -> bool:
        html = self._render("pipeline_manual_review", {
            "developer_name": developer_name,
            "plugin_name": plugin_name,
            "plugin_version": plugin_version,
            "submission_id": submission_id,
            "anomaly_score": anomaly_score,
        })
        return await self._send(to, f"[{plugin_name}] Votre plugin est en cours d'examen", html)

    async def pipeline_failed(
        self,
        to: str,
        developer_name: str,
        plugin_name: str,
        plugin_version: str,
        submission_id: str,
    ) -> bool:
        html = self._render("pipeline_failed", {
            "developer_name": developer_name,
            "plugin_name": plugin_name,
            "plugin_version": plugin_version,
            "submission_id": submission_id,
        })
        return await self._send(to, f"[{plugin_name}] Erreur lors de l'analyse", html)

    async def org_invitation(
        self,
        to: str,
        organization_name: str,
        inviter_name: str,
        role: str,
        accept_url: str,
        expires_at: str,
    ) -> bool:
        html = self._render("org_invitation", {
            "organization_name": organization_name,
            "inviter_name": inviter_name,
            "role": role,
            "accept_url": accept_url,
            "expires_at": expires_at,
        })
        return await self._send(to, f"Invitation à rejoindre {organization_name} sur XCore Hub", html)

    # ── Emails admin ──────────────────────────────────────────────────────────

    async def admin_new_submission(
        self,
        to: str | list[str],
        developer_name: str,
        developer_email: str,
        plugin_name: str,
        plugin_version: str,
        submission_id: str,
        source: str = "upload",
    ) -> bool:
        html = self._render("admin_new_submission", {
            "developer_name": developer_name,
            "developer_email": developer_email,
            "plugin_name": plugin_name,
            "plugin_version": plugin_version,
            "submission_id": submission_id,
            "source": source,
        })
        return await self._send(to, f"[Admin] Nouvelle soumission — {plugin_name} v{plugin_version}", html)

    async def admin_manual_review(
        self,
        to: str | list[str],
        developer_name: str,
        developer_email: str,
        plugin_name: str,
        plugin_version: str,
        submission_id: str,
        anomaly_score: int,
    ) -> bool:
        html = self._render("admin_manual_review", {
            "developer_name": developer_name,
            "developer_email": developer_email,
            "plugin_name": plugin_name,
            "plugin_version": plugin_version,
            "submission_id": submission_id,
            "anomaly_score": anomaly_score,
        })
        return await self._send(to, f"[Action requise] Révision manuelle — {plugin_name}", html)

    async def admin_approved(
        self,
        to: str | list[str],
        developer_name: str,
        plugin_name: str,
        plugin_version: str,
        submission_id: str,
        anomaly_score: int,
    ) -> bool:
        html = self._render("admin_approved", {
            "developer_name": developer_name,
            "plugin_name": plugin_name,
            "plugin_version": plugin_version,
            "submission_id": submission_id,
            "anomaly_score": anomaly_score,
        })
        return await self._send(to, f"[Admin] Plugin publié — {plugin_name} v{plugin_version}", html)

    async def admin_rejected(
        self,
        to: str | list[str],
        developer_name: str,
        plugin_name: str,
        plugin_version: str,
        submission_id: str,
        anomaly_score: int,
        rejection_reason: str,
    ) -> bool:
        html = self._render("admin_rejected", {
            "developer_name": developer_name,
            "plugin_name": plugin_name,
            "plugin_version": plugin_version,
            "submission_id": submission_id,
            "anomaly_score": anomaly_score,
            "rejection_reason": rejection_reason,
        })
        return await self._send(to, f"[Admin] Plugin rejeté — {plugin_name} v{plugin_version}", html)
