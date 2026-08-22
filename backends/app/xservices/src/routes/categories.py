from __future__ import annotations

from typing import Any, List

from fastapi import APIRouter

from ..schemas.service import CategoryOut
from ..services.category import CategoryService


def categories_router(db: Any) -> APIRouter:
    router = APIRouter(prefix="/categories", tags=["xservices"])

    @router.get("", response_model=List[CategoryOut])
    async def list_categories() -> Any:
        async with db.session() as session:
            return await CategoryService(session).list_all()

    return router
