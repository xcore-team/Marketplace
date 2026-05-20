from __future__ import annotations

import re
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.plugin import Category, Plugin, PluginVersion


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    return re.sub(r"-+", "-", slug)


class PluginService:
    def __init__(self, session: AsyncSession):
        self._s = session

    async def create(
        self,
        developer_id: str,
        name: str,
        description: Optional[str] = None,
        homepage: Optional[str] = None,
        repository: Optional[str] = None,
        category_ids: Optional[List[str]] = None,
    ) -> Plugin:
        slug = _slugify(name)
        existing = await self._s.scalar(select(Plugin).where(Plugin.slug == slug))
        if existing:
            raise ValueError(f"Un plugin avec le slug '{slug}' existe déjà.")
        plugin = Plugin(
            developer_id=developer_id,
            name=name,
            slug=slug,
            description=description,
            homepage=homepage,
            repository=repository,
        )
        self._s.add(plugin)
        await self._s.flush()

        if category_ids:
            result = await self._s.execute(
                select(Category).where(Category.id.in_(category_ids))
            )
            plugin.categories = list(result.scalars().all())
            await self._s.flush()

        return plugin

    async def get(self, plugin_id: str) -> Optional[Plugin]:
        return await self._s.scalar(
            select(Plugin)
            .where(Plugin.id == plugin_id)
            .options(selectinload(Plugin.versions), selectinload(Plugin.categories))
        )

    async def get_by_slug(self, slug: str) -> Optional[Plugin]:
        return await self._s.scalar(
            select(Plugin)
            .where(Plugin.slug == slug)
            .options(selectinload(Plugin.versions), selectinload(Plugin.categories))
        )

    async def count_published(
        self, search: Optional[str] = None, category_id: Optional[str] = None
    ) -> int:
        from sqlalchemy import func

        q = select(func.count()).select_from(Plugin).where(Plugin.is_published == True)  # noqa: E712
        if search:
            q = q.where(
                Plugin.name.ilike(f"%{search}%")
                | Plugin.description.ilike(f"%{search}%")
            )
        if category_id:
            q = q.where(Plugin.categories.any(Category.id == category_id))
        return (await self._s.scalar(q)) or 0

    async def list_published(
        self,
        limit: int = 50,
        offset: int = 0,
        search: Optional[str] = None,
        category_id: Optional[str] = None,
        sort: Optional[str] = "newest",
    ) -> List[Plugin]:
        _sort_col = {
            "downloads": Plugin.download_count.desc(),
            "rating": Plugin.avg_rating.desc(),
            "security": Plugin.avg_rating.desc(),  # fallback: no dedicated security col
        }.get(sort or "newest", Plugin.updated_at.desc())
        q = (
            select(Plugin)
            .where(Plugin.is_published == True)  # noqa: E712
            .options(selectinload(Plugin.versions), selectinload(Plugin.categories))
            .order_by(_sort_col)
            .limit(limit)
            .offset(offset)
        )
        if search:
            q = q.where(
                Plugin.name.ilike(f"%{search}%")
                | Plugin.description.ilike(f"%{search}%")
            )
        if category_id:
            q = q.where(Plugin.categories.any(Category.id == category_id))
        return list((await self._s.execute(q)).scalars().all())

    async def list_by_developer(self, developer_id: str) -> List[Plugin]:
        result = await self._s.execute(
            select(Plugin)
            .where(Plugin.developer_id == developer_id)
            .options(selectinload(Plugin.versions), selectinload(Plugin.categories))
            .order_by(Plugin.updated_at.desc())
        )
        return list(result.scalars().all())

    # Aligné sur SCORE_AUTO_APPROVE du pipeline (pipelines/models.py)
    SCORE_AUTO_PUBLISH = 20

    async def add_version(
        self,
        plugin: Plugin,
        version: str,
        anomaly_score: int = 0,
        merkle_root: Optional[str] = None,
        is_stable: bool = False,
        changelog: Optional[str] = None,
    ) -> PluginVersion:
        from pipelines.models import SCORE_AUTO_REJECT

        if anomaly_score >= SCORE_AUTO_REJECT:
            publish_status = "rejected"
        elif anomaly_score <= self.SCORE_AUTO_PUBLISH:
            publish_status = "auto_published"
        else:
            publish_status = "manual_review"

        pv = PluginVersion(
            plugin_id=plugin.id,
            version=version,
            anomaly_score=anomaly_score,
            merkle_root=merkle_root,
            is_stable=is_stable,
            changelog=changelog,
            publish_status=publish_status,
        )
        self._s.add(pv)

        if publish_status in ("auto_published", "manual_review"):
            plugin.is_published = True
        elif publish_status == "rejected":
            plugin.is_published = False

        await self._s.flush()
        return pv

    async def yank_version(
        self,
        plugin_id: str,
        version: str,
        reason: Optional[str] = None,
    ) -> Optional[PluginVersion]:
        """Retire une version spécifique sans la supprimer."""
        result = await self._s.execute(
            select(PluginVersion)
            .where(PluginVersion.plugin_id == plugin_id)
            .where(PluginVersion.version == version)
        )
        pv = result.scalar_one_or_none()
        if pv is None:
            return None
        pv.is_yanked = True
        pv.yanked_reason = reason
        pv.publish_status = "yanked"
        await self._s.flush()
        return pv
