from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from xcore.kernel.api import AuthPayload, get_current_user
from xcore.sdk import require_permission

from ..models.plugin import Plugin, PluginVersion
from ..schemas.plugin import PluginCreate, PluginOut
from ..schemas.rating import RatingCreate, RatingOut
from ..services.plugin import PluginService
from ..services.rating import RatingService


class _Page:
    """Envelope de pagination légère."""
    def __init__(self, items, total, limit, offset):
        self.items = items
        self.total = total
        self.limit = limit
        self.offset = offset
        self.has_more = offset + limit < total


def plugins_router(db: Any) -> APIRouter:
    router = APIRouter(prefix="/plugins", tags=["plugins"])

    # ── Public ────────────────────────────────────────────────────────────────

    @router.get("/check-name")
    async def check_plugin_name(
        name: str = Query(..., description="Nom du plugin à vérifier"),
    ) -> Any:
        """Vérifie si un nom de plugin est déjà pris — public. Utile avant soumission."""
        slug = name.lower().strip().replace(" ", "-")
        async with db.session() as session:
            existing = await session.scalar(
                select(Plugin).where(Plugin.slug == slug)
            )
        return {"name": name, "slug": slug, "available": existing is None}

    @router.get("")
    async def list_plugins(
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        search: Optional[str] = Query(None, description="Recherche par nom ou description"),
        category_id: Optional[str] = Query(None, description="Filtrer par catégorie"),
    ) -> Any:
        """Liste tous les plugins publiés — public. Retourne {items, total, limit, offset, has_more}."""
        async with db.session() as session:
            svc = PluginService(session)
            total = await svc.count_published(search=search, category_id=category_id)
            items = await svc.list_published(limit=limit, offset=offset, search=search, category_id=category_id)
            return {
                "items": items,
                "total": total,
                "limit": limit,
                "offset": offset,
                "has_more": offset + limit < total,
            }

    @router.get("/{slug}", response_model=PluginOut)
    async def get_plugin(slug: str) -> Any:
        """Détails d'un plugin — public. Incrémente le compteur de téléchargements."""
        async with db.session() as session:
            plugin = await PluginService(session).get_by_slug(slug)
            if plugin is None:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            plugin.download_count = (plugin.download_count or 0) + 1
            await session.commit()
            await session.refresh(plugin)
            return plugin

    # ── Authentifié ───────────────────────────────────────────────────────────

    @router.get("/me/plugins", response_model=List[PluginOut])
    async def my_plugins(
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Plugins du développeur connecté."""
        async with db.session() as session:
            return await PluginService(session).list_by_developer(user["sub"])

    # ── RBAC : plugins:write ──────────────────────────────────────────────────

    @router.post("", response_model=PluginOut, status_code=status.HTTP_201_CREATED)
    async def create_plugin(
        body: PluginCreate,
        user: AuthPayload = Depends(require_permission("plugins:write")),
    ) -> Any:
        """Crée une fiche plugin. Requiert la permission plugins:write."""
        async with db.session() as session:
            try:
                plugin = await PluginService(session).create(
                    developer_id=user["sub"],
                    name=body.name,
                    description=body.description,
                    homepage=body.homepage,
                    repository=body.repository,
                    category_ids=body.category_ids or [],
                )
                await session.commit()
                await session.refresh(plugin)
                return plugin
            except ValueError as exc:
                raise HTTPException(status_code=409, detail=str(exc))

    @router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_plugin(
        slug: str,
        user: AuthPayload = Depends(require_permission("plugins:write")),
    ) -> None:
        """Supprime un plugin (propriétaire uniquement). Requiert plugins:write."""
        async with db.session() as session:
            plugin = await PluginService(session).get_by_slug(slug)
            if plugin is None or plugin.developer_id != user["sub"]:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            await session.delete(plugin)
            await session.commit()

    # ── Notation ─────────────────────────────────────────────────────────────

    @router.post("/{slug}/ratings", response_model=RatingOut, status_code=status.HTTP_201_CREATED)
    async def rate_plugin(
        slug: str,
        body: RatingCreate,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Soumet ou met à jour la note (1–5) de l'utilisateur pour un plugin."""
        async with db.session() as session:
            plugin = await PluginService(session).get_by_slug(slug)
            if plugin is None or not plugin.is_published:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            if plugin.developer_id == user["sub"]:
                raise HTTPException(status_code=403, detail="Vous ne pouvez pas noter votre propre plugin.")
            try:
                rating = await RatingService(session).rate(
                    plugin=plugin,
                    user_id=user["sub"],
                    score=body.score,
                    comment=body.comment,
                )
                await session.commit()
                return rating
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))

    @router.get("/{slug}/ratings")
    async def list_plugin_ratings(
        slug: str,
        limit: int = Query(20, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ) -> Any:
        """Liste les notes d'un plugin — public. Retourne {items, total, limit, offset, has_more}."""
        async with db.session() as session:
            plugin = await PluginService(session).get_by_slug(slug)
            if plugin is None:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            return await RatingService(session).list_ratings(plugin.id, limit=limit, offset=offset)

    @router.get("/{slug}/ratings/me", response_model=RatingOut)
    async def my_rating(
        slug: str,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Retourne la note de l'utilisateur connecté pour ce plugin."""
        async with db.session() as session:
            plugin = await PluginService(session).get_by_slug(slug)
            if plugin is None:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            rating = await RatingService(session).get_user_rating(plugin.id, user["sub"])
            if rating is None:
                raise HTTPException(status_code=404, detail="Vous n'avez pas encore noté ce plugin.")
            return rating

    return router
