from __future__ import annotations

import re
from typing import List, Optional

from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.plugin import Category, Plugin, plugin_category_table


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    return re.sub(r"-+", "-", slug)


class CategoryService:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def create(self, name: str, description: Optional[str] = None) -> Category:
        slug = _slugify(name)
        existing = await self._s.scalar(select(Category).where(Category.slug == slug))
        if existing:
            raise ValueError(f"La catégorie '{slug}' existe déjà.")
        category = Category(name=name, slug=slug, description=description)
        self._s.add(category)
        await self._s.flush()
        return category

    async def get(self, category_id: str) -> Optional[Category]:
        return await self._s.scalar(select(Category).where(Category.id == category_id))

    async def get_by_slug(self, slug: str) -> Optional[Category]:
        return await self._s.scalar(select(Category).where(Category.slug == slug))

    async def list_all(self) -> List[Category]:
        result = await self._s.execute(select(Category).order_by(Category.name))
        return list(result.scalars().all())

    async def delete(self, category: Category) -> None:
        await self._s.delete(category)
        await self._s.flush()

    async def list_plugins(
        self, category_id: str, limit: int = 50, offset: int = 0
    ) -> List[Plugin]:
        result = await self._s.execute(
            select(Plugin)
            .join(Plugin.categories)
            .where(Category.id == category_id)
            .where(Plugin.is_published == True)  # noqa: E712
            .options(selectinload(Plugin.versions), selectinload(Plugin.categories))
            .order_by(Plugin.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def assign_categories(self, plugin: Plugin, category_ids: List[str]) -> None:
        """Remplace les catégories d'un plugin par la liste fournie.

        Utilise du SQL direct sur la table d'association pour éviter tout
        lazy-loading de la collection ORM (interdit en async SQLAlchemy).
        """
        # Supprimer toutes les associations existantes
        await self._s.execute(
            delete(plugin_category_table).where(
                plugin_category_table.c.plugin_id == plugin.id
            )
        )
        if category_ids:
            # Vérifier que les IDs existent bien dans la table categories
            result = await self._s.execute(
                select(Category.id).where(Category.id.in_(category_ids))
            )
            valid_ids = [row[0] for row in result.all()]
            if valid_ids:
                await self._s.execute(
                    insert(plugin_category_table).values([
                        {"plugin_id": plugin.id, "category_id": cid}
                        for cid in valid_ids
                    ])
                )
        await self._s.flush()
        # Invalider le cache ORM de la relation pour forcer un rechargement propre
        self._s.expire(plugin, ["categories"])
