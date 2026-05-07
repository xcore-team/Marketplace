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
            select(Plugin).where(Plugin.id == plugin_id).options(selectinload(Plugin.versions), selectinload(Plugin.categories))
        )

    async def get_by_slug(self, slug: str) -> Optional[Plugin]:
        return await self._s.scalar(
            select(Plugin).where(Plugin.slug == slug).options(selectinload(Plugin.versions), selectinload(Plugin.categories))
        )

    async def list_published(self, limit: int = 50, offset: int = 0) -> List[Plugin]:
        result = await self._s.execute(
            select(Plugin)
            .where(Plugin.is_published == True)  # noqa: E712
            .options(selectinload(Plugin.versions), selectinload(Plugin.categories))
            .order_by(Plugin.updated_at.desc())
            .limit(limit).offset(offset)
        )
        return list(result.scalars().all())

    async def list_by_developer(self, developer_id: str) -> List[Plugin]:
        result = await self._s.execute(
            select(Plugin)
            .where(Plugin.developer_id == developer_id)
            .options(selectinload(Plugin.versions), selectinload(Plugin.categories))
            .order_by(Plugin.updated_at.desc())
        )
        return list(result.scalars().all())

    # Seuil de publication automatique
    SCORE_AUTO_PUBLISH = 30

    async def add_version(
        self,
        plugin: Plugin,
        version: str,
        anomaly_score: int = 0,
        merkle_root: Optional[str] = None,
        verified_zip_path: Optional[str] = None,
        is_stable: bool = False,
        changelog: Optional[str] = None,
        notifications=None,
        admin_email: Optional[str] = None,
    ) -> PluginVersion:
        from pipelines.models import SCORE_AUTO_REJECT

        # Détermine le statut de publication selon l'anomaly_score
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
            verified_zip_path=verified_zip_path,
            is_stable=is_stable,
            changelog=changelog,
            publish_status=publish_status,
        )
        self._s.add(pv)

        # Mise à jour de la visibilité du plugin
        if publish_status in ("auto_published", "manual_review"):
            plugin.is_published = True
        elif publish_status == "rejected":
            plugin.is_published = False

        await self._s.flush()

        # Notifications
        if notifications and admin_email:
            if publish_status == "auto_published":
                notifications.on_auto_published(
                    admin_email, plugin.name, version, anomaly_score
                )
            elif publish_status == "manual_review":
                notifications.on_manual_review_admin(
                    admin_email, plugin.name, version, anomaly_score
                )

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
