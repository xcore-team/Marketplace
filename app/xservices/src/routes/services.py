from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, update
from xcore.kernel.api import AuthPayload, get_current_user
from xcore.sdk import require_permission

from ..models.service import Service, ServiceCategory, ServiceRating
from ..schemas.doc import ServiceDocOut
from ..schemas.service import CategoryOut, RatingCreate, RatingOut, ServiceOut, ServiceSummary, ServiceUpdate
from ..services.doc_extractor import ServiceDocExtractorService
from ..services.service import ServiceService


def services_router(db: Any) -> APIRouter:
    router = APIRouter(prefix="/services", tags=["xservices"])

    # ── Categories ────────────────────────────────────────────────────────────

    @router.get("/categories", response_model=List[CategoryOut])
    async def list_categories() -> Any:
        async with db.session() as session:
            result = await session.execute(select(ServiceCategory).order_by(ServiceCategory.name))
            return list(result.scalars().all())

    # ── Public ────────────────────────────────────────────────────────────────

    @router.get("", response_model=List[ServiceSummary])
    async def list_services(
        search: Optional[str] = Query(None, max_length=128),
        category_id: Optional[str] = Query(None),
        sort: Optional[str] = Query("newest", pattern="^(newest|installs|rating)$"),
        limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ) -> Any:
        async with db.session() as session:
            items = await ServiceService(session).list_published(
                limit=limit, offset=offset, search=search,
                category_id=category_id, sort=sort,
            )
            return [ServiceSummary.from_orm_with_latest(s) for s in items]

    @router.get("/mine", response_model=List[ServiceSummary])
    async def list_my_services(
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        async with db.session() as session:
            items = await ServiceService(session).list_by_developer(user["sub"])
            return [ServiceSummary.from_orm_with_latest(s) for s in items]

    @router.get("/{slug}", response_model=ServiceOut)
    async def get_service(slug: str) -> Any:
        async with db.session() as session:
            svc = await ServiceService(session).get_by_slug(slug)
            if svc is None:
                raise HTTPException(status_code=404, detail="Extension introuvable")
            return ServiceOut.from_orm_with_latest(svc)

    # ── Propriétaire ─────────────────────────────────────────────────────────

    @router.patch("/{slug}", response_model=ServiceOut)
    async def update_service(
        slug: str,
        body: ServiceUpdate,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Met à jour description, homepage, repository (propriétaire uniquement)."""
        async with db.session() as session:
            svc = await ServiceService(session).get_by_slug(slug)
            if svc is None or svc.developer_id != user["sub"]:
                raise HTTPException(status_code=404, detail="Extension introuvable")
            if body.description is not None:
                svc.description = body.description
            if body.homepage is not None:
                svc.homepage = body.homepage or None
            if body.repository is not None:
                svc.repository = body.repository or None
            await session.commit()
            await session.refresh(svc)
            return ServiceOut.from_orm_with_latest(svc)

    @router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_service(
        slug: str,
        user: AuthPayload = Depends(require_permission("services:write")),
    ) -> None:
        """Supprime un service et toutes ses versions (propriétaire uniquement)."""
        async with db.session() as session:
            svc = await ServiceService(session).get_by_slug(slug)
            if svc is None or svc.developer_id != user["sub"]:
                raise HTTPException(status_code=404, detail="Extension introuvable")
            await session.delete(svc)
            await session.commit()

    # ── Authentifié ───────────────────────────────────────────────────────────

    @router.get("/{slug}/docs", response_model=ServiceDocOut)
    async def get_service_docs(slug: str) -> Any:
        """Retourne les docs (README, integration, contributor) de la dernière version validée."""
        async with db.session() as session:
            svc = await session.scalar(select(Service).where(Service.slug == slug))
            if svc is None:
                raise HTTPException(status_code=404, detail="Extension introuvable")
            doc = await ServiceDocExtractorService(session).get_latest(svc.id)
            if doc is None:
                raise HTTPException(status_code=404, detail="Documentation non disponible")
            return doc

    @router.get("/{slug}/versions/{version}/docs", response_model=ServiceDocOut)
    async def get_service_version_docs(slug: str, version: str) -> Any:
        """Retourne les docs d'une version spécifique."""
        async with db.session() as session:
            svc = await session.scalar(select(Service).where(Service.slug == slug))
            if svc is None:
                raise HTTPException(status_code=404, detail="Extension introuvable")
            doc = await ServiceDocExtractorService(session).get(svc.id, version)
            if doc is None:
                raise HTTPException(status_code=404, detail=f"Documentation introuvable pour v{version}")
            return doc

    @router.post("/{slug}/install", status_code=status.HTTP_200_OK)
    async def increment_install(
        slug: str,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Incrémente le compteur d'installations (appelé lors d'une installation réelle)."""
        async with db.session() as session:
            svc = await session.scalar(select(Service).where(Service.slug == slug))
            if svc is None or not svc.is_published:
                raise HTTPException(status_code=404, detail="Extension introuvable")
            await session.execute(
                update(Service)
                .where(Service.id == svc.id)
                .values(install_count=Service.install_count + 1)
            )
            await session.commit()
            return {"detail": "ok"}

    @router.get("/{slug}/ratings", response_model=List[RatingOut])
    async def list_ratings(slug: str) -> Any:
        async with db.session() as session:
            svc = await session.scalar(select(Service).where(Service.slug == slug))
            if svc is None:
                raise HTTPException(status_code=404, detail="Extension introuvable")
            result = await session.execute(
                select(ServiceRating)
                .where(ServiceRating.service_id == svc.id)
                .order_by(ServiceRating.created_at.desc())
            )
            return list(result.scalars().all())

    @router.get("/{slug}/ratings/me", response_model=RatingOut)
    async def my_rating(slug: str, user: AuthPayload = Depends(get_current_user)) -> Any:
        async with db.session() as session:
            svc = await session.scalar(select(Service).where(Service.slug == slug))
            if svc is None:
                raise HTTPException(status_code=404, detail="Extension introuvable")
            r = await session.scalar(
                select(ServiceRating).where(
                    ServiceRating.service_id == svc.id,
                    ServiceRating.user_id == user["sub"],
                )
            )
            if r is None:
                raise HTTPException(status_code=404, detail="Aucun avis trouvé")
            return r

    @router.post("/{slug}/ratings", response_model=RatingOut, status_code=status.HTTP_201_CREATED)
    async def rate_service(
        slug: str,
        body: RatingCreate,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        async with db.session() as session:
            svc = await session.scalar(select(Service).where(Service.slug == slug))
            if svc is None or not svc.is_published:
                raise HTTPException(status_code=404, detail="Extension introuvable")

            existing = await session.scalar(
                select(ServiceRating).where(
                    ServiceRating.service_id == svc.id,
                    ServiceRating.user_id == user["sub"],
                )
            )
            if existing:
                existing.score = body.score
                existing.comment = body.comment
                await session.commit()
                await session.refresh(existing)
                await _refresh_avg(session, svc.id)
                await session.commit()
                return existing

            rating = ServiceRating(
                service_id=svc.id,
                user_id=user["sub"],
                score=body.score,
                comment=body.comment,
            )
            session.add(rating)
            await session.flush()
            await _refresh_avg(session, svc.id)
            await session.commit()
            await session.refresh(rating)
            return rating

    return router


async def _refresh_avg(session: Any, service_id: str) -> None:
    from sqlalchemy import func
    row = await session.execute(
        select(func.avg(ServiceRating.score), func.count(ServiceRating.id))
        .where(ServiceRating.service_id == service_id)
    )
    avg, count = row.one()
    await session.execute(
        update(Service)
        .where(Service.id == service_id)
        .values(avg_rating=round(float(avg or 0), 2), rating_count=count or 0)
    )
