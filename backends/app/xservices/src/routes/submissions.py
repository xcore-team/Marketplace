from __future__ import annotations

import json
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from xcore.kernel.api import AuthPayload, get_current_user
from xcore.sdk import require_permission

from ..models.service import ServiceSubmission
from ..schemas.submission import SubmissionOut

logger = logging.getLogger("hub.xservices.submissions")

_UPLOAD_DIR = Path(tempfile.gettempdir()) / "xcore_service_submissions"
_UPLOAD_DIR.mkdir(exist_ok=True)


def submissions_router(db: Any, events: Any, secret_key: bytes = b"") -> APIRouter:
    router = APIRouter(prefix="/submissions", tags=["xservices"])

    @router.post("", response_model=SubmissionOut, status_code=status.HTTP_202_ACCEPTED)
    async def submit_service(
        user: AuthPayload = Depends(require_permission("services:write")),
        file: UploadFile = File(..., description="Archive ZIP de l'extension de service"),
        service_name: str = Form(...),
        service_version: str = Form(...),
        category_ids: Optional[str] = Form(None, description="JSON array de category UUIDs"),
        visibility: str = Form("public"),
    ) -> Any:
        """
        Soumet un ZIP d'extension de service. Répond immédiatement 202.
        Utiliser GET /submissions/{id} pour suivre l'état.
        Requiert la permission services:write.

        Note : cette voie n'a pas de dépôt/tag Git associé — la documentation
        (README/integration/contributor) n'est donc pas récupérable automatiquement
        pour une extension créée ainsi (contrairement à /github/publish).
        """
        if not file.filename or not file.filename.endswith(".zip"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Seuls les fichiers .zip sont acceptés.",
            )
        if visibility not in ("public", "private"):
            raise HTTPException(status_code=400, detail="visibility doit être 'public' ou 'private'")
        # tenant_id vient du claim JWT de l'appelant, jamais du corps de la
        # requête — pas de vérification d'appartenance à faire, contrairement
        # à l'ancien organization_id (voir routes/github.py's version de ce fix).
        tenant_id = user.get("tenant_id") or (user.get("user") or {}).get("tenant_id")

        zip_path = _UPLOAD_DIR / f"{user['sub']}_{file.filename}"
        with zip_path.open("wb") as f:
            shutil.copyfileobj(file.file, f)

        async with db.session() as session:
            sub = ServiceSubmission(
                developer_id=user["sub"],
                service_name=service_name,
                service_version=service_version,
                status="pending",
                category_ids=category_ids,
                visibility=visibility,
                tenant_id=tenant_id,
            )
            session.add(sub)
            await session.commit()
            await session.refresh(sub)

        if events:
            try:
                await events.emit("ext.notification.publish", {
                    "channel": "notification",
                    "user_id": user["sub"],
                    "event": "SERVICE_SUBMISSION_RECEIVED",
                    "submission_id": sub.id,
                    "service_name": service_name,
                })
            except Exception as exc:
                logger.warning("Emit SERVICE_SUBMISSION_RECEIVED échoué : %s", exc)

        try:
            from xcore.sdk import task_registry
            task_registry["xservices.process_submission"].apply_async(
                kwargs=dict(
                    submission_id=sub.id,
                    developer_id=user["sub"],
                    zip_path=str(zip_path),
                    service_name=service_name,
                    service_version=service_version,
                    secret_key=secret_key.decode("latin-1") if secret_key else "",
                    db_url=str(db.engine.url),
                ),
                queue="submissions",
            )
        except Exception as exc:
            async with db.session() as session:
                s = await session.get(ServiceSubmission, sub.id)
                if s:
                    s.status = "failed"
                    await session.commit()
            raise HTTPException(status_code=503, detail=f"Worker indisponible : {exc}")

        return sub

    @router.get("", response_model=List[SubmissionOut])
    async def list_submissions(
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        async with db.session() as session:
            result = await session.execute(
                select(ServiceSubmission)
                .where(ServiceSubmission.developer_id == user["sub"])
                .order_by(ServiceSubmission.created_at.desc())
                .limit(50)
            )
            return list(result.scalars().all())

    @router.get("/{submission_id}", response_model=SubmissionOut)
    async def get_submission(
        submission_id: str,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        async with db.session() as session:
            sub = await session.scalar(
                select(ServiceSubmission).where(ServiceSubmission.id == submission_id)
            )
            if sub is None or sub.developer_id != user["sub"]:
                raise HTTPException(status_code=404, detail="Soumission introuvable")
            return sub

    @router.get("/{submission_id}/report")
    async def get_submission_report(
        submission_id: str,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        async with db.session() as session:
            sub = await session.scalar(
                select(ServiceSubmission).where(ServiceSubmission.id == submission_id)
            )
            if sub is None or sub.developer_id != user["sub"]:
                raise HTTPException(status_code=404, detail="Soumission introuvable")
            if sub.report_json is None:
                raise HTTPException(status_code=404, detail="Rapport non disponible")
            return json.loads(sub.report_json)

    return router
