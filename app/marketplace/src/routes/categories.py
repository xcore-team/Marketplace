from __future__ import annotations

from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from xcore.kernel.api import AuthPayload
from xcore.sdk import require_permission

from ..schemas.category import CategoryCreate, CategoryOut
from ..schemas.plugin import PluginOut
from ..services.category import CategoryService


def categories_router(db: Any) -> APIRouter:
    router = APIRouter(prefix="/categories", tags=["categories"])

    # ── Public ────────────────────────────────────────────────────────────────

    @router.get("", response_model=List[CategoryOut])
    async def list_categories() -> Any:
        """Liste toutes les catégories — public."""
        async with db.session() as session:
            return await CategoryService(session).list_all()

    @router.get("/{slug}/plugins", response_model=List[PluginOut])
    async def list_plugins_by_category(
        slug: str, limit: int = 50, offset: int = 0
    ) -> Any:
        """Liste les plugins publiés d'une catégorie — public."""
        async with db.session() as session:
            svc = CategoryService(session)
            category = await svc.get_by_slug(slug)
            if category is None:
                raise HTTPException(status_code=404, detail="Catégorie introuvable")
            return await svc.list_plugins(category.id, limit=limit, offset=offset)

    # ── Admin : plugin:approve requis pour gérer les catégories ──────────────

    @router.post("", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
    async def create_category(
        body: CategoryCreate,
        current_user: AuthPayload = Depends(require_permission("plugin:approve")),
    ) -> Any:
        """Crée une catégorie. Requiert plugin:approve."""
        async with db.session() as session:
            try:
                category = await CategoryService(session).create(
                    name=body.name, description=body.description
                )
                await session.commit()
                await session.refresh(category)
                return category
            except ValueError as exc:
                raise HTTPException(status_code=409, detail=str(exc))

    @router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_category(
        slug: str,
        current_user: AuthPayload = Depends(require_permission("plugin:approve")),
    ) -> None:
        """Supprime une catégorie. Requiert plugin:approve."""
        async with db.session() as session:
            svc = CategoryService(session)
            category = await svc.get_by_slug(slug)
            if category is None:
                raise HTTPException(status_code=404, detail="Catégorie introuvable")
            await svc.delete(category)
            await session.commit()

    return router
