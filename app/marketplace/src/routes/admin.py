from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select, text as sql_text
from sqlalchemy.orm import selectinload
from xcore.kernel.api import AuthPayload
from xcore.sdk import require_permission

from ..models.plugin import Category, Plugin
from ..models.submission import Submission
from ..schemas.plugin import PluginAdminUpdate, PluginOut, PluginVersionOut, VersionYankRequest
from ..schemas.submission import SubmissionOut
from ..services.category import CategoryService
from ..services.plugin import PluginService

logger = logging.getLogger("hub.marketplace.admin")


class DeveloperOut(BaseModel):
    id: str
    email: str
    plugin_count: int

    model_config = {"from_attributes": True}


def admin_router(db: Any, events=None) -> APIRouter:
    router = APIRouter(prefix="/admin", tags=["admin"])

    # ── Plugins ───────────────────────────────────────────────────────────────

    @router.get("/plugins", response_model=List[PluginOut])
    async def list_all_plugins(
        published: Optional[bool] = Query(None, description="Filtrer par statut de publication"),
        limit: int = 50,
        offset: int = 0,
        current_user: AuthPayload = Depends(require_permission("plugin:approve")),
    ) -> Any:
        """Liste tous les plugins (publiés ou non) — admin uniquement."""
        async with db.session() as session:
            q = (
                select(Plugin)
                .options(selectinload(Plugin.versions), selectinload(Plugin.categories))
                .order_by(Plugin.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
            if published is not None:
                q = q.where(Plugin.is_published == published)
            result = await session.execute(q)
            return list(result.scalars().all())

    @router.get("/plugins/{slug}", response_model=PluginOut)
    async def get_plugin_admin(
        slug: str,
        current_user: AuthPayload = Depends(require_permission("plugin:approve")),
    ) -> Any:
        """Détails complets d'un plugin — admin."""
        async with db.session() as session:
            plugin = await session.scalar(
                select(Plugin)
                .where(Plugin.slug == slug)
                .options(selectinload(Plugin.versions), selectinload(Plugin.categories))
            )
            if plugin is None:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            return plugin

    @router.patch("/plugins/{slug}", response_model=PluginOut)
    async def update_plugin(
        slug: str,
        body: PluginAdminUpdate,
        current_user: AuthPayload = Depends(require_permission("plugin:approve")),
    ) -> Any:
        """
        Modifie le statut ou les métadonnées d'un plugin.
        Permet de publier, dépublier, changer la description, les catégories.
        """
        async with db.session() as session:
            plugin = await session.scalar(
                select(Plugin)
                .where(Plugin.slug == slug)
                .options(selectinload(Plugin.versions), selectinload(Plugin.categories))
            )
            if plugin is None:
                raise HTTPException(status_code=404, detail="Plugin introuvable")

            if body.is_published is not None:
                plugin.is_published = body.is_published

            if body.description is not None:
                plugin.description = body.description

            if body.category_ids is not None:
                cat_svc = CategoryService(session)
                await cat_svc.assign_categories(plugin, body.category_ids)

            await session.commit()
            await session.refresh(plugin)

            # Notification temps réel via le gestionnaire d'events xcore → xpulse
            if events and body.is_published is not None:
                try:
                    await events.emit("ext.notification.broadcast", {
                        "channels": ["broadcast"],
                        "text": "PLUGIN_PUBLISHED" if body.is_published else "PLUGIN_UNPUBLISHED",
                        "plugin_id": plugin.id,
                        "name": plugin.name,
                        "slug": plugin.slug,
                        "is_published": plugin.is_published,
                    })
                except Exception as _e:
                    logger.warning("Emit events xcore échoué : %s", _e)

            return plugin

    @router.delete("/plugins/{slug}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_plugin_admin(
        slug: str,
        current_user: AuthPayload = Depends(require_permission("plugin:delete")),
    ) -> None:
        """Supprime définitivement un plugin — admin."""
        async with db.session() as session:
            plugin = await session.scalar(select(Plugin).where(Plugin.slug == slug))
            if plugin is None:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            await session.delete(plugin)
            await session.commit()

    @router.post("/plugins/{slug}/versions/{version}/yank", response_model=PluginVersionOut)
    async def yank_version(
        slug: str,
        version: str,
        body: VersionYankRequest,
        current_user: AuthPayload = Depends(require_permission("plugin:approve")),
    ) -> Any:
        """
        Retire (yank) une version spécifique d'un plugin.
        La version reste visible dans l'historique mais est marquée comme retirée.
        """
        async with db.session() as session:
            plugin = await session.scalar(select(Plugin).where(Plugin.slug == slug))
            if plugin is None:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            pv = await PluginService(session).yank_version(
                plugin_id=plugin.id, version=version, reason=body.reason
            )
            if pv is None:
                raise HTTPException(status_code=404, detail="Version introuvable")
            await session.commit()
            await session.refresh(pv)
            return pv

    # ── Soumissions ───────────────────────────────────────────────────────────

    @router.get("/submissions", response_model=List[SubmissionOut])
    async def list_all_submissions(
        status_filter: Optional[str] = Query(None, alias="status"),
        limit: int = 50,
        offset: int = 0,
        current_user: AuthPayload = Depends(require_permission("submission:review")),
    ) -> Any:
        """Liste toutes les soumissions — admin. Filtrable par status."""
        async with db.session() as session:
            q = (
                select(Submission)
                .order_by(Submission.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
            if status_filter:
                q = q.where(Submission.status == status_filter)
            result = await session.execute(q)
            return list(result.scalars().all())

    @router.patch("/submissions/{submission_id}/status", response_model=SubmissionOut)
    async def set_submission_status(
        submission_id: str,
        new_status: str = Query(..., description="approved | rejected | manual_review | pending"),
        current_user: AuthPayload = Depends(require_permission("submission:review")),
    ) -> Any:
        """Force le statut d'une soumission — admin."""
        allowed = {"approved", "rejected", "manual_review", "pending"}
        if new_status not in allowed:
            raise HTTPException(status_code=400, detail=f"Statut invalide. Valeurs: {allowed}")
        async with db.session() as session:
            sub = await session.get(Submission, submission_id)
            if sub is None:
                raise HTTPException(status_code=404, detail="Soumission introuvable")
            sub.status = new_status

            plugin = await session.scalar(
                select(Plugin).where(Plugin.slug == sub.plugin_name.lower().replace(" ", "-"))
            )

            if new_status in ("approved", "manual_review"):
                if plugin:
                    plugin.is_published = True
            elif new_status == "rejected":
                if plugin:
                    plugin.is_published = False

            await session.commit()
            await session.refresh(sub)

            # Notification temps réel + email via le bus d'events xcore → xpulse + notify_result
            if events:
                try:
                    await events.emit("ext.notification.publish", {
                        "channel": "notification",
                        "user_id": sub.developer_id,
                        "event": "SUBMISSION_STATUS_CHANGED",
                        "submission_id": sub.id,
                        "plugin_name": sub.plugin_name,
                        "plugin_version": sub.plugin_version,
                        "status": new_status,
                    })
                    await events.emit("ext.notification.publish", {
                        "channel": "admin",
                        "user_id": "admin",
                        "event": "SUBMISSION_STATUS_CHANGED",
                        "submission_id": sub.id,
                        "plugin_name": sub.plugin_name,
                        "status": new_status,
                    })
                except Exception as exc:
                    logger.warning("Emit events xcore échoué : %s", exc)

            return sub

    # ── Développeurs ──────────────────────────────────────────────────────────

    @router.get("/developers", response_model=List[DeveloperOut])
    async def list_developers(
        limit: int = 50,
        offset: int = 0,
        current_user: AuthPayload = Depends(require_permission("plugin:approve")),
    ) -> Any:
        """Liste tous les développeurs ayant au moins un plugin, avec leur nombre de plugins."""
        async with db.session() as session:
            rows = await session.execute(
                sql_text(
                    "SELECT u.id, u.email, COUNT(p.id) AS plugin_count "
                    "FROM xauth_users u "
                    "JOIN market_plugins p ON p.developer_id = u.id "
                    "GROUP BY u.id, u.email "
                    "ORDER BY plugin_count DESC "
                    "LIMIT :limit OFFSET :offset"
                ),
                {"limit": limit, "offset": offset},
            )
            return [
                DeveloperOut(id=row.id, email=row.email, plugin_count=row.plugin_count)
                for row in rows.fetchall()
            ]

    @router.get("/developers/{developer_id}/plugins", response_model=List[PluginOut])
    async def list_plugins_by_developer(
        developer_id: str,
        current_user: AuthPayload = Depends(require_permission("plugin:approve")),
    ) -> Any:
        """Liste tous les plugins d'un développeur donné — admin."""
        async with db.session() as session:
            result = await session.execute(
                select(Plugin)
                .where(Plugin.developer_id == developer_id)
                .options(selectinload(Plugin.versions), selectinload(Plugin.categories))
                .order_by(Plugin.created_at.desc())
            )
            return list(result.scalars().all())

    return router
