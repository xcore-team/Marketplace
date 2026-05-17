from __future__ import annotations

from typing import List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.plugin import Plugin
from ..models.rating import PluginRating


class RatingService:
    def __init__(self, session: AsyncSession):
        self._s = session

    async def rate(
        self,
        plugin: Plugin,
        user_id: str,
        score: int,
        comment: Optional[str] = None,
    ) -> PluginRating:
        if not 1 <= score <= 5:
            raise ValueError("Le score doit être entre 1 et 5.")

        existing = await self._s.scalar(
            select(PluginRating).where(
                PluginRating.plugin_id == plugin.id,
                PluginRating.user_id == user_id,
            )
        )

        if existing:
            existing.score = score
            existing.comment = comment
            rating = existing
        else:
            rating = PluginRating(
                plugin_id=plugin.id,
                user_id=user_id,
                score=score,
                comment=comment,
            )
            self._s.add(rating)

        await self._s.flush()
        await self._recompute_avg(plugin)
        return rating

    async def get_user_rating(self, plugin_id: str, user_id: str) -> Optional[PluginRating]:
        return await self._s.scalar(
            select(PluginRating).where(
                PluginRating.plugin_id == plugin_id,
                PluginRating.user_id == user_id,
            )
        )

    async def list_ratings(
        self, plugin_id: str, limit: int = 20, offset: int = 0
    ) -> dict:
        total = (await self._s.scalar(
            select(func.count()).select_from(PluginRating).where(PluginRating.plugin_id == plugin_id)
        )) or 0
        result = await self._s.execute(
            select(PluginRating)
            .where(PluginRating.plugin_id == plugin_id)
            .order_by(PluginRating.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
        items = list(result.scalars().all())
        return {"items": items, "total": total, "limit": limit, "offset": offset, "has_more": offset + limit < total}

    async def _recompute_avg(self, plugin: Plugin) -> None:
        row = await self._s.execute(
            select(func.avg(PluginRating.score), func.count(PluginRating.id)).where(
                PluginRating.plugin_id == plugin.id
            )
        )
        avg, count = row.one()
        plugin.avg_rating = round(float(avg or 0), 2)
        plugin.rating_count = count or 0
        await self._s.flush()
