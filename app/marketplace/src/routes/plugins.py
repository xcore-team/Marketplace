from __future__ import annotations

from pathlib import Path
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from xcore.kernel.api import AuthPayload, get_current_user
from xcore.sdk import require_permission

from ..models.plugin import Plugin, PluginVersion
from ..schemas.plugin import PluginCreate, PluginOut
from ..schemas.rating import RatingCreate, RatingOut
from ..services.plugin import PluginService
from ..services.rating import RatingService


def plugins_router(db: Any) -> APIRouter:
    router = APIRouter(prefix="/plugins", tags=["plugins"])

    # ── Public ────────────────────────────────────────────────────────────────

    @router.get("", response_model=List[PluginOut])
    async def list_plugins(limit: int = 50, offset: int = 0) -> Any:
        """Liste tous les plugins publiés — public."""
        async with db.session() as session:
            return await PluginService(session).list_published(limit=limit, offset=offset)

    @router.get("/{slug}", response_model=PluginOut)
    async def get_plugin(slug: str) -> Any:
        """Détails d'un plugin — public."""
        async with db.session() as session:
            plugin = await PluginService(session).get_by_slug(slug)
            if plugin is None:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            return plugin

    @router.get("/{slug}/versions/{version}/download")
    async def download_plugin_version(
        slug: str,
        version: str,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """
        Télécharge le ZIP vérifié d'une version spécifique.
        Le plugin doit être publié. La version ne doit pas être yankée.
        """
        async with db.session() as session:
            plugin = await session.scalar(select(Plugin).where(Plugin.slug == slug))
            if plugin is None or not plugin.is_published:
                raise HTTPException(status_code=404, detail="Plugin introuvable")

            pv = await session.scalar(
                select(PluginVersion)
                .where(PluginVersion.plugin_id == plugin.id)
                .where(PluginVersion.version == version)
            )
            if pv is None:
                raise HTTPException(status_code=404, detail="Version introuvable")
            if pv.is_yanked:
                raise HTTPException(
                    status_code=410,
                    detail=f"Version retirée{f' : {pv.yanked_reason}' if pv.yanked_reason else ''}",
                )
            if not pv.verified_zip_path:
                raise HTTPException(status_code=404, detail="Fichier ZIP non disponible")

            zip_path = Path(pv.verified_zip_path)
            if not zip_path.exists():
                raise HTTPException(status_code=404, detail="Fichier ZIP introuvable sur le serveur")

            return FileResponse(
                path=str(zip_path),
                media_type="application/zip",
                filename=f"{slug}-{version}.zip",
            )

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

    @router.get("/{slug}/ratings", response_model=List[RatingOut])
    async def list_plugin_ratings(
        slug: str,
        limit: int = 20,
        offset: int = 0,
    ) -> Any:
        """Liste les notes d'un plugin — public."""
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
