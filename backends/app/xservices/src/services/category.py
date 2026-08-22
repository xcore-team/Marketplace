from __future__ import annotations

import re
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.service import ServiceCategory


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    return re.sub(r"-+", "-", slug)


class CategoryService:
    def __init__(self, session: AsyncSession):
        self._s = session

    async def list_all(self) -> List[ServiceCategory]:
        result = await self._s.execute(select(ServiceCategory).order_by(ServiceCategory.name))
        return list(result.scalars().all())

    async def create(self, name: str, description: Optional[str] = None) -> ServiceCategory:
        cat = ServiceCategory(name=name, slug=_slugify(name), description=description)
        self._s.add(cat)
        await self._s.flush()
        return cat
