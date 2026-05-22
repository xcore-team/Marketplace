from __future__ import annotations

import json
import logging
import tempfile
from pathlib import Path
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from xcore.kernel.api import AuthPayload, get_current_user
from xcore.sdk import require_permission

from ..models.service import ServiceSubmission
from ..schemas.submission import SubmissionOut

logger = logging.getLogger("hub.xservices.github")

_UPLOAD_DIR = Path(tempfile.gettempdir()) / "xcore_service_submissions"
_UPLOAD_DIR.mkdir(exist_ok=True)


class ServicePublishRequest(BaseModel):
    full_name: str
    default_branch: str
    service_version: str
    category_ids: List[str] = []


def service_github_router(db: Any, events: Any, secret_key: bytes = b"") -> APIRouter:
    router = APIRouter(prefix="/github", tags=["xservices-github"])

    @router.post("/publish", response_model=SubmissionOut, status_code=status.HTTP_202_ACCEPTED)
    async def publish_service_from_github(
        body: ServicePublishRequest,
        user: AuthPayload = Depends(require_permission("services:write")),
    ) -> Any:
        """
        Télécharge le ZIP depuis GitHub et soumet l'extension de service.
        Réutilise le token GitHub lié depuis le marketplace.
        """
        repo_parts = body.full_name.split("/", 1)
        if len(repo_parts) != 2:
            raise HTTPException(status_code=400, detail="full_name doit être 'owner/repo'")
        repo_owner, repo_name = repo_parts
        service_name = repo_name
        branch = body.default_branch

        try:
            from app.marketplace.src.services.github import GitHubService as _GHService
            async with db.session() as session:
                zip_path = await _GHService(session).download_repo_zip(
                    user_id=user["sub"],
                    repo_owner=repo_owner,
                    repo_name=repo_name,
                    branch=branch,
                    dest_dir=_UPLOAD_DIR,
                )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"Impossible de télécharger le repo : {exc}")

        async with db.session() as session:
            sub = ServiceSubmission(
                developer_id=user["sub"],
                service_name=service_name,
                service_version=body.service_version.strip(),
                status="pending",
                source="github",
                github_repo=body.full_name,
                github_branch=branch,
                category_ids=json.dumps(body.category_ids) if body.category_ids else None,
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
                    service_version=body.service_version.strip(),
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

    return router
