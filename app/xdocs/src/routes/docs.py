from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ..models.doc import PluginDoc
from ..schemas.doc import PluginDocOut
from ..services.extractor import DocExtractorService


def docs_router(db: Any) -> APIRouter:
    router = APIRouter(prefix="/plugins", tags=["docs"])

    @router.get("/{slug}/docs", response_model=PluginDocOut)
    async def get_plugin_docs(slug: str) -> Any:
        """
        Retourne les docs de la dernière version validée du plugin.
        Contient README.md, integration.md et contributor.yaml extraits du ZIP vérifié.
        """
        async with db.session() as session:
            # Résout le slug → plugin_id via une jointure légère
            from sqlalchemy import text as sql_text
            row = await session.execute(
                sql_text("SELECT id FROM market_plugins WHERE slug = :slug LIMIT 1"),
                {"slug": slug},
            )
            plugin_row = row.fetchone()
            if plugin_row is None:
                raise HTTPException(status_code=404, detail="Plugin introuvable")

            doc = await DocExtractorService(session).get_latest(plugin_row.id)
            if doc is None:
                raise HTTPException(status_code=404, detail="Documentation non disponible")
            return doc

    @router.get("/{slug}/versions/{version}/docs", response_model=PluginDocOut)
    async def get_plugin_version_docs(slug: str, version: str) -> Any:
        """
        Retourne les docs d'une version spécifique du plugin.
        """
        async with db.session() as session:
            from sqlalchemy import text as sql_text
            row = await session.execute(
                sql_text("SELECT id FROM market_plugins WHERE slug = :slug LIMIT 1"),
                {"slug": slug},
            )
            plugin_row = row.fetchone()
            if plugin_row is None:
                raise HTTPException(status_code=404, detail="Plugin introuvable")

            doc = await DocExtractorService(session).get(plugin_row.id, version)
            if doc is None:
                raise HTTPException(status_code=404, detail=f"Documentation introuvable pour v{version}")
            return doc

    return router
