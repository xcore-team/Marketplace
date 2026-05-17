from __future__ import annotations

import json
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Any, List, Optional

logger = logging.getLogger("hub.marketplace.submissions")

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from xcore.kernel.api import AuthPayload, get_current_user
from xcore.sdk import require_permission

from sandbox import SandboxLimits

from middleware.submission_limit import check_submission_rate

from ..models.submission import Submission
from ..schemas.submission import SubmissionOut

# Répertoire persistant pour les ZIPs en attente de traitement
_UPLOAD_DIR = Path(tempfile.gettempdir()) / "xcore_submissions"
_UPLOAD_DIR.mkdir(exist_ok=True)


def submissions_router(
    db: Any,
    events: Any,
    secret_key: bytes = b"",
    limits: SandboxLimits | None = None,
) -> APIRouter:
    router = APIRouter(prefix="/submissions", tags=["submissions"])
    _limits = limits or SandboxLimits()

    # ── RBAC : submissions:write ──────────────────────────────────────────────

    @router.post("", response_model=SubmissionOut, status_code=status.HTTP_202_ACCEPTED)
    async def submit_plugin(
        user: AuthPayload = Depends(require_permission("submissions:write")),
        file: UploadFile = File(..., description="Archive ZIP du plugin"),
        plugin_name: str = Form(...),
        plugin_version: str = Form(...),
        category_ids: Optional[str] = Form(None, description="JSON array de category UUIDs ex: [\"uuid1\",\"uuid2\"]"),
    ) -> Any:
        """
        Accepte le ZIP et envoie le pipeline en tâche Celery — répond immédiatement 202.
        Utiliser GET /submissions/{id} pour suivre l'état.
        Requiert la permission submissions:write.
        """
        allowed, retry_after = check_submission_rate(user["sub"])
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="Limite de soumissions atteinte (10/heure). Réessayez plus tard.",
                headers={"Retry-After": str(retry_after)},
            )

        if not file.filename or not file.filename.endswith(".zip"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Seuls les fichiers .zip sont acceptés.",
            )

        # Sauvegarde le ZIP dans un dossier persistant (le worker y accède)
        zip_path = _UPLOAD_DIR / f"{user['sub']}_{file.filename}"
        with zip_path.open("wb") as f:
            shutil.copyfileobj(file.file, f)

        # Crée la soumission en DB avec status "pending" — répond immédiatement
        async with db.session() as session:
            sub = Submission(
                developer_id=user["sub"],
                plugin_name=plugin_name,
                plugin_version=plugin_version,
                status="pending",
                source="upload",
                category_ids=category_ids,
            )
            session.add(sub)
            await session.commit()
            await session.refresh(sub)

        # Notifie le dev via xpulse que la soumission est reçue
        if events:
            try:
                await events.emit("ext.notification.publish", {
                    "channel": "notification",
                    "user_id": user["sub"],
                    "event": "SUBMISSION_RECEIVED",
                    "submission_id": sub.id,
                    "plugin_name": plugin_name,
                })
            except Exception as exc:
                logger.warning("Emit SUBMISSION_RECEIVED échoué : %s", exc)

        # Envoie la tâche au worker Celery — non bloquant
        try:
            from xcore.sdk import task_registry
            task_registry["marketplace.process_submission"].apply_async(
                kwargs=dict(
                    submission_id=sub.id,
                    developer_id=user["sub"],
                    zip_path=str(zip_path),
                    plugin_name=plugin_name,
                    plugin_version=plugin_version,
                    secret_key=secret_key.decode("latin-1") if secret_key else "",
                    db_url=str(db.engine.url),
                    sandbox_memory_mb=_limits.memory_mb,
                    sandbox_cpu_seconds=_limits.cpu_seconds,
                    sandbox_timeout=_limits.timeout,
                ),
                queue="submissions",
            )
        except Exception as exc:
            # Si Celery est indisponible, on marque la soumission comme failed
            async with db.session() as session:
                s = await session.get(Submission, sub.id)
                if s:
                    s.status = "failed"
                    await session.commit()
            raise HTTPException(status_code=503, detail=f"Worker indisponible : {exc}")

        return sub

    # ── Authentifié ───────────────────────────────────────────────────────────

    @router.get("", response_model=List[SubmissionOut])
    async def list_submissions(
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Liste les soumissions du développeur connecté."""
        async with db.session() as session:
            result = await session.execute(
                select(Submission)
                .where(Submission.developer_id == user["sub"])
                .order_by(Submission.created_at.desc())
                .limit(50)
            )
            return list(result.scalars().all())

    @router.get("/{submission_id}", response_model=SubmissionOut)
    async def get_submission(
        submission_id: str,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Détails d'une soumission (propriétaire uniquement)."""
        async with db.session() as session:
            sub = await session.scalar(
                select(Submission).where(Submission.id == submission_id)
            )
            if sub is None or sub.developer_id != user["sub"]:
                raise HTTPException(status_code=404, detail="Soumission introuvable")
            return sub

    @router.get("/{submission_id}/report")
    async def get_submission_report(
        submission_id: str,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Rapport JSON complet du pipeline de validation."""
        import json

        async with db.session() as session:
            sub = await session.scalar(
                select(Submission).where(Submission.id == submission_id)
            )
            if sub is None or sub.developer_id != user["sub"]:
                raise HTTPException(status_code=404, detail="Soumission introuvable")
            if sub.report_json is None:
                raise HTTPException(status_code=404, detail="Rapport non disponible")
            return json.loads(sub.report_json)

    return router
