from __future__ import annotations

import re
from typing import Any, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text as sql_text
from xcore.kernel.api import AuthPayload
from xcore.sdk import require_permission

from ..schemas.admin import PageOut, PluginAdminOut


class DeveloperOut(BaseModel):
    id: str
    email: str
    github_login: Optional[str] = None
    plugin_count: int

    model_config = {"from_attributes": True}


class ContributorOut(BaseModel):
    login: str
    contributions: int
    avatar_url: Optional[str] = None
    html_url: Optional[str] = None


def plugins_router(db: Any, events: Any = None) -> APIRouter:
    router = APIRouter(prefix="/plugins", tags=["admin:plugins"])

    @router.get("", response_model=PageOut[PluginAdminOut])
    async def list_plugins(
        published: Optional[bool] = Query(None),
        search: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        current_user: AuthPayload = Depends(require_permission("plugin:approve")),
    ) -> Any:
        async with db.session() as session:
            params = {
                "published": published,
                "search": search,
                "pattern": f"%{search}%" if search else None,
                "limit": limit,
                "offset": offset,
            }
            total_row = await session.execute(
                sql_text("""
                    SELECT COUNT(*) AS n FROM market_plugins p
                    WHERE (:published IS NULL OR p.is_published = :published)
                      AND (:search IS NULL OR p.name LIKE :pattern OR p.slug LIKE :pattern)
                """),
                params,
            )
            total = total_row.fetchone().n

            rows = await session.execute(
                sql_text("""
                    SELECT
                        p.id, p.name, p.slug, p.developer_id,
                        u.email AS developer_email,
                        p.is_published, p.avg_rating, p.rating_count, p.created_at,
                        COUNT(pv.id) AS version_count
                    FROM market_plugins p
                    LEFT JOIN xauth_users u ON u.id = p.developer_id
                    LEFT JOIN market_plugin_versions pv ON pv.plugin_id = p.id
                    WHERE (:published IS NULL OR p.is_published = :published)
                      AND (:search IS NULL OR p.name LIKE :pattern OR p.slug LIKE :pattern)
                    GROUP BY p.id, p.name, p.slug, p.developer_id, u.email,
                             p.is_published, p.avg_rating, p.rating_count, p.created_at
                    ORDER BY p.created_at DESC
                    LIMIT :limit OFFSET :offset
                """),
                params,
            )
            items = [
                PluginAdminOut(
                    id=r.id, name=r.name, slug=r.slug, developer_id=r.developer_id,
                    developer_email=r.developer_email, is_published=r.is_published,
                    avg_rating=r.avg_rating, rating_count=r.rating_count,
                    version_count=r.version_count, created_at=r.created_at,
                )
                for r in rows.fetchall()
            ]
            return PageOut(items=items, total=total, limit=limit, offset=offset, has_more=offset + limit < total)

    @router.patch("/{slug}/publish", status_code=status.HTTP_204_NO_CONTENT)
    async def toggle_publish(
        slug: str,
        published: bool = Query(...),
        current_user: AuthPayload = Depends(require_permission("plugin:approve")),
    ) -> None:
        async with db.session() as session:
            result = await session.execute(
                sql_text("UPDATE market_plugins SET is_published = :pub WHERE slug = :slug"),
                {"pub": published, "slug": slug},
            )
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            await session.commit()

        if events:
            try:
                await events.emit("ext.notification.broadcast", {
                    "channels": ["broadcast"],
                    "text": "PLUGIN_PUBLISHED" if published else "PLUGIN_UNPUBLISHED",
                    "slug": slug,
                    "is_published": published,
                })
            except Exception:
                pass

    @router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_plugin(
        slug: str,
        current_user: AuthPayload = Depends(require_permission("plugin:delete")),
    ) -> None:
        async with db.session() as session:
            result = await session.execute(
                sql_text("DELETE FROM market_plugins WHERE slug = :slug"),
                {"slug": slug},
            )
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            await session.commit()

    @router.post("/{slug}/versions/{version}/yank", status_code=status.HTTP_204_NO_CONTENT)
    async def yank_version(
        slug: str,
        version: str,
        reason: Optional[str] = Query(None),
        current_user: AuthPayload = Depends(require_permission("plugin:approve")),
    ) -> None:
        async with db.session() as session:
            result = await session.execute(
                sql_text("""
                    UPDATE market_plugin_versions
                    SET is_yanked = :yanked, yanked_reason = :reason, publish_status = 'yanked'
                    WHERE version = :version
                      AND plugin_id = (SELECT id FROM market_plugins WHERE slug = :slug LIMIT 1)
                """),
                {"slug": slug, "version": version, "reason": reason, "yanked": True},
            )
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Version introuvable")
            await session.commit()

    # ── Développeurs ──────────────────────────────────────────────────────────

    @router.get("/developers", response_model=PageOut[DeveloperOut])
    async def list_developers(
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        current_user: AuthPayload = Depends(require_permission("plugin:approve")),
    ) -> Any:
        async with db.session() as session:
            total_row = await session.execute(sql_text(
                "SELECT COUNT(DISTINCT p.developer_id) AS n FROM market_plugins p"
            ))
            total = total_row.fetchone().n
            rows = await session.execute(
                sql_text("""
                    SELECT u.id, u.email, COUNT(p.id) AS plugin_count, gh.github_login
                    FROM xauth_users u
                    JOIN market_plugins p ON p.developer_id = u.id
                    LEFT JOIN market_github_tokens gh ON gh.user_id = u.id
                    GROUP BY u.id, u.email, gh.github_login
                    ORDER BY plugin_count DESC
                    LIMIT :limit OFFSET :offset
                """),
                {"limit": limit, "offset": offset},
            )
            items = [
                DeveloperOut(id=r.id, email=r.email, github_login=r.github_login, plugin_count=r.plugin_count)
                for r in rows.fetchall()
            ]
            return PageOut(items=items, total=total, limit=limit, offset=offset, has_more=offset + limit < total)

    @router.get("/developers/{developer_id}/plugins", response_model=List[PluginAdminOut])
    async def list_plugins_by_developer(
        developer_id: str,
        current_user: AuthPayload = Depends(require_permission("plugin:approve")),
    ) -> Any:
        async with db.session() as session:
            rows = await session.execute(
                sql_text("""
                    SELECT p.id, p.name, p.slug, p.developer_id,
                           u.email AS developer_email, p.is_published,
                           p.avg_rating, p.rating_count, p.created_at,
                           COUNT(pv.id) AS version_count
                    FROM market_plugins p
                    LEFT JOIN xauth_users u ON u.id = p.developer_id
                    LEFT JOIN market_plugin_versions pv ON pv.plugin_id = p.id
                    WHERE p.developer_id = :dev_id
                    GROUP BY p.id, p.name, p.slug, p.developer_id, u.email,
                             p.is_published, p.avg_rating, p.rating_count, p.created_at
                    ORDER BY p.created_at DESC
                """),
                {"dev_id": developer_id},
            )
            return [
                PluginAdminOut(
                    id=r.id, name=r.name, slug=r.slug, developer_id=r.developer_id,
                    developer_email=r.developer_email, is_published=r.is_published,
                    avg_rating=r.avg_rating, rating_count=r.rating_count,
                    version_count=r.version_count, created_at=r.created_at,
                )
                for r in rows.fetchall()
            ]

    @router.get("/{slug}/contributors", response_model=List[ContributorOut])
    async def get_plugin_contributors(
        slug: str,
        current_user: AuthPayload = Depends(require_permission("plugin:approve")),
    ) -> Any:
        async with db.session() as session:
            row = await session.execute(
                sql_text("SELECT repository, developer_id FROM market_plugins WHERE slug = :slug"),
                {"slug": slug},
            )
            plugin = row.fetchone()
            if plugin is None:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            if not plugin.repository:
                raise HTTPException(status_code=404, detail="Aucun dépôt GitHub configuré")

            match = re.search(r"github\.com/([^/]+/[^/]+?)(?:\.git)?$", plugin.repository.rstrip("/"))
            if not match:
                raise HTTPException(status_code=422, detail="URL de dépôt GitHub invalide")
            repo_path = match.group(1)

            gh_row = await session.execute(
                sql_text("SELECT access_token FROM market_github_tokens WHERE user_id = :uid"),
                {"uid": plugin.developer_id},
            )
            gh = gh_row.fetchone()

        headers = {"Accept": "application/vnd.github+json"}
        if gh:
            headers["Authorization"] = f"Bearer {gh.access_token}"

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{repo_path}/contributors",
                headers=headers,
                params={"per_page": 100},
            )
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Dépôt introuvable ou privé sans token lié")
        if resp.status_code == 403:
            raise HTTPException(status_code=403, detail="Accès GitHub refusé")
        resp.raise_for_status()

        return [
            ContributorOut(
                login=c["login"], contributions=c["contributions"],
                avatar_url=c.get("avatar_url"), html_url=c.get("html_url"),
            )
            for c in resp.json()
            if c.get("type") != "Anonymous"
        ]

    return router
