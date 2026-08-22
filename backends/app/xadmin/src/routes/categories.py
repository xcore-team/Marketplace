from __future__ import annotations

from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text as sql_text
from xcore.kernel.api import AuthPayload
from xcore.sdk import require_permission

from ..schemas.admin import CategoryAdminCreate, CategoryAdminUpdate


def categories_router(db: Any) -> APIRouter:
    router = APIRouter(prefix="/categories", tags=["admin:categories"])

    @router.get("")
    async def list_categories(
        current_user: AuthPayload = Depends(require_permission("plugin:approve")),
    ) -> Any:
        """Liste toutes les catégories avec le nombre de plugins associés."""
        async with db.session() as session:
            rows = await session.execute(
                sql_text("""
                    SELECT c.id, c.name, c.slug, c.description,
                           COUNT(pc.plugin_id) AS plugin_count
                    FROM market_categories c
                    LEFT JOIN market_plugin_categories pc ON pc.category_id = c.id
                    GROUP BY c.id, c.name, c.slug, c.description
                    ORDER BY c.name
                """)
            )
            return [dict(r._mapping) for r in rows.fetchall()]

    @router.post("", status_code=status.HTTP_201_CREATED)
    async def create_category(
        body: CategoryAdminCreate,
        current_user: AuthPayload = Depends(require_permission("plugin:approve")),
    ) -> Any:
        """Crée une nouvelle catégorie."""
        async with db.session() as session:
            from uuid import uuid4
            cat_id = str(uuid4())
            try:
                await session.execute(
                    sql_text("""
                        INSERT INTO market_categories (id, name, slug, description)
                        VALUES (:id, :name, :slug, :description)
                    """),
                    {"id": cat_id, "name": body.name, "slug": body.slug, "description": body.description},
                )
                await session.commit()
            except Exception:
                raise HTTPException(status_code=409, detail="Nom ou slug déjà utilisé")
            return {"id": cat_id, "name": body.name, "slug": body.slug, "description": body.description}

    @router.patch("/{category_id}")
    async def update_category(
        category_id: str,
        body: CategoryAdminUpdate,
        current_user: AuthPayload = Depends(require_permission("plugin:approve")),
    ) -> Any:
        """Met à jour le nom ou la description d'une catégorie."""
        async with db.session() as session:
            updates = {k: v for k, v in body.model_dump().items() if v is not None}
            if not updates:
                raise HTTPException(status_code=400, detail="Aucun champ à mettre à jour")
            set_clause = ", ".join(f"{k} = :{k}" for k in updates)
            result = await session.execute(
                sql_text(f"UPDATE market_categories SET {set_clause} WHERE id = :id"),
                {**updates, "id": category_id},
            )
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Catégorie introuvable")
            await session.commit()
            return {"id": category_id, **updates}

    @router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_category(
        category_id: str,
        current_user: AuthPayload = Depends(require_permission("plugin:delete")),
    ) -> None:
        """Supprime une catégorie (les plugins ne sont pas supprimés)."""
        async with db.session() as session:
            result = await session.execute(
                sql_text("DELETE FROM market_categories WHERE id = :id"),
                {"id": category_id},
            )
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Catégorie introuvable")
            await session.commit()

    return router
