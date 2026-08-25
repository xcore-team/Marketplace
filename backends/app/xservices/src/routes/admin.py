from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update
from xcore.kernel.api import AuthPayload
from xcore.sdk import require_permission

from ..models.service import Service, ServiceSubmission, ServiceVersion
from ..schemas.service import ServiceOut
from ..schemas.submission import SubmissionOut


def admin_router(db: Any) -> APIRouter:
    router = APIRouter(prefix="/admin", tags=["xservices-admin"])

    _admin = Depends(require_permission("admin:services"))

    @router.get("/submissions", response_model=List[SubmissionOut])
    async def list_all_submissions(
        status: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        user: AuthPayload = _admin,
    ) -> Any:
        async with db.session() as session:
            q = select(ServiceSubmission).order_by(ServiceSubmission.created_at.desc()).limit(limit).offset(offset)
            if status:
                q = q.where(ServiceSubmission.status == status)
            return list((await session.execute(q)).scalars().all())

    @router.post("/submissions/{submission_id}/approve")
    async def approve_submission(
        submission_id: str,
        user: AuthPayload = _admin,
    ) -> Any:
        async with db.session() as session:
            sub = await session.scalar(
                select(ServiceSubmission).where(ServiceSubmission.id == submission_id)
            )
            if sub is None:
                raise HTTPException(status_code=404, detail="Soumission introuvable")
            if sub.status != "manual_review":
                raise HTTPException(status_code=400, detail="Seules les soumissions en révision peuvent être approuvées manuellement")

            sub.status = "approved"
            svc_q = select(Service).where(Service.developer_id == sub.developer_id, Service.name == sub.service_name)
            svc = await session.scalar(svc_q)
            if svc:
                svc.is_published = True
                sv_q = select(ServiceVersion).where(
                    ServiceVersion.service_id == svc.id,
                    ServiceVersion.version == sub.service_version,
                )
                sv = await session.scalar(sv_q)
                if sv:
                    sv.publish_status = "auto_published"

            await session.commit()
            return {"detail": "approuvé"}

    @router.post("/submissions/{submission_id}/reject")
    async def reject_submission(
        submission_id: str,
        reason: Optional[str] = Query(None),
        user: AuthPayload = _admin,
    ) -> Any:
        async with db.session() as session:
            sub = await session.scalar(
                select(ServiceSubmission).where(ServiceSubmission.id == submission_id)
            )
            if sub is None:
                raise HTTPException(status_code=404, detail="Soumission introuvable")
            sub.status = "rejected"
            await session.commit()
            return {"detail": "rejeté"}

    @router.get("/services", response_model=List[ServiceOut])
    async def list_all_services(
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        user: AuthPayload = _admin,
    ) -> Any:
        from sqlalchemy.orm import selectinload
        async with db.session() as session:
            q = (
                select(Service)
                .options(selectinload(Service.versions), selectinload(Service.categories))
                .order_by(Service.created_at.desc())
                .limit(limit).offset(offset)
            )
            return list((await session.execute(q)).scalars().all())

    @router.delete("/services/{service_id}")
    async def delete_service(
        service_id: str,
        user: AuthPayload = _admin,
    ) -> Any:
        async with db.session() as session:
            svc = await session.get(Service, service_id)
            if svc is None:
                raise HTTPException(status_code=404, detail="Extension introuvable")
            await session.delete(svc)
            await session.commit()
            return {"detail": "supprimé"}

    @router.post("/services/{service_id}/versions/{version}/yank")
    async def yank_version(
        service_id: str,
        version: str,
        reason: Optional[str] = Query(None),
        user: AuthPayload = _admin,
    ) -> Any:
        from ..services.service import ServiceService
        async with db.session() as session:
            svc_service = ServiceService(session)
            sv = await svc_service.yank_version(service_id, version, reason)
            if sv is None:
                raise HTTPException(status_code=404, detail="Version introuvable")
            await session.commit()
            return {"detail": "version retirée", "version": version}

    return router
