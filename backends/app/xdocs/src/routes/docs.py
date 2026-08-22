from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from xcore.kernel.api import AuthPayload, get_current_user

from ..schemas.doc import PluginDocOut
from ..services.extractor import DocExtractorService


async def _optional_user(request: Request) -> Optional[AuthPayload]:
    try:
        return await get_current_user(request, None)  # type: ignore[arg-type]
    except Exception:
        return None


async def _get_visible_plugin_row(db: Any, ctx: Any, slug: str, viewer_id: Optional[str]) -> Any:
    """Résout le slug → ligne plugin (id, visibility, developer_id, tenant_id) et
    vérifie l'accès si le plugin est privé. Lève 404 (sans distinguer inexistant/privé)."""
    from sqlalchemy import text as sql_text

    async with db.session() as session:
        row = await session.execute(
            sql_text(
                "SELECT id, visibility, developer_id, tenant_id "
                "FROM market_plugins WHERE slug = :slug LIMIT 1"
            ),
            {"slug": slug},
        )
        plugin_row = row.fetchone()
    if plugin_row is None:
        raise HTTPException(status_code=404, detail="Plugin introuvable")

    if (plugin_row.visibility or "public") == "private":
        allowed = bool(viewer_id) and viewer_id == plugin_row.developer_id
        if not allowed and viewer_id and plugin_row.tenant_id:
            access = await ctx(
                "auth",
                "xauth.tenant_access",
                {"user_id": viewer_id, "tenant_id": plugin_row.tenant_id, "permissions": []},
            )
            allowed = access.get("status") == "ok" and access.get("has_access", False)
        if not allowed:
            raise HTTPException(status_code=404, detail="Plugin introuvable")

    return plugin_row


def docs_router(db: Any, ctx: Any) -> APIRouter:
    router = APIRouter(prefix="/plugins", tags=["docs"])

    @router.get("/{slug}/docs", response_model=PluginDocOut)
    async def get_plugin_docs(
        slug: str,
        viewer: Optional[AuthPayload] = Depends(_optional_user),
    ) -> Any:
        """
        Retourne les docs de la dernière version validée du plugin.
        Contient README.md, integration.yaml et CONTRIBUTING.md récupérés depuis
        le repo GitHub au tag publié (disponible uniquement pour les plugins
        soumis via /github/publish). Un plugin privé n'est visible que par son
        propriétaire ou un membre de l'équipe propriétaire.
        """
        plugin_row = await _get_visible_plugin_row(db, ctx, slug, viewer["sub"] if viewer else None)
        async with db.session() as session:
            doc = await DocExtractorService(session).get_latest(plugin_row.id)
            if doc is None:
                raise HTTPException(status_code=404, detail="Documentation non disponible")
            return doc

    @router.get("/{slug}/versions/{version}/docs", response_model=PluginDocOut)
    async def get_plugin_version_docs(
        slug: str,
        version: str,
        viewer: Optional[AuthPayload] = Depends(_optional_user),
    ) -> Any:
        """Retourne les docs d'une version spécifique du plugin."""
        plugin_row = await _get_visible_plugin_row(db, ctx, slug, viewer["sub"] if viewer else None)
        async with db.session() as session:
            doc = await DocExtractorService(session).get(plugin_row.id, version)
            if doc is None:
                raise HTTPException(status_code=404, detail=f"Documentation introuvable pour v{version}")
            return doc

    return router
