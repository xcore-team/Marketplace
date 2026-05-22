from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from xcore.kernel.api import AuthPayload, get_current_user
from xcore.sdk import require_permission

from sandbox import SandboxLimits

from ..models.submission import Submission
from ..schemas.submission import SubmissionOut, SubmitGitHubRequest
from ..services.github import GitHubService

logger = logging.getLogger("hub.marketplace.github")

_UPLOAD_DIR = Path(tempfile.gettempdir()) / "xcore_submissions"
_UPLOAD_DIR.mkdir(exist_ok=True)


class LinkGitHubRequest(BaseModel):
    access_token: str


class GitHubAccountOut(BaseModel):
    github_login: str
    github_user_id: str
    scopes: str | None
    linked: bool = True


def github_router(
    db: Any,
    events: Any,
    secret_key: bytes = b"",
    limits: SandboxLimits | None = None,
) -> APIRouter:
    router = APIRouter(prefix="/github", tags=["github"])
    _limits = limits or SandboxLimits()

    # ── Authentifié ───────────────────────────────────────────────────────────

    @router.post("/link", response_model=GitHubAccountOut)
    async def link_github(
        body: LinkGitHubRequest,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Lie un compte GitHub via personal access token ou token OAuth."""
        async with db.session() as session:
            try:
                token = await GitHubService(session).link_account(
                    user_id=user["sub"],
                    access_token=body.access_token,
                )
                await session.commit()
                return GitHubAccountOut(
                    github_login=token.github_login,
                    github_user_id=token.github_user_id,
                    scopes=token.scopes,
                )
            except Exception as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    @router.get("/link", response_model=GitHubAccountOut)
    async def get_github_link(
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Retourne le compte GitHub lié (si existant)."""
        async with db.session() as session:
            token = await GitHubService(session).get_linked(user["sub"])
            if token is None:
                raise HTTPException(status_code=404, detail="Aucun compte GitHub lié")
            return GitHubAccountOut(
                github_login=token.github_login,
                github_user_id=token.github_user_id,
                scopes=token.scopes,
            )

    @router.delete("/link", status_code=status.HTTP_204_NO_CONTENT)
    async def unlink_github(
        user: AuthPayload = Depends(get_current_user),
    ) -> None:
        """Délie le compte GitHub."""
        async with db.session() as session:
            token = await GitHubService(session).get_linked(user["sub"])
            if token is None:
                raise HTTPException(status_code=404, detail="Aucun compte GitHub lié")
            await session.delete(token)
            await session.commit()

    @router.get("/repos")
    async def list_github_repos(
        per_page: int = 30,
        page: int = 1,
        sort: str = "updated",
        manifest: Optional[str] = Query(None, description="Filtrer les repos contenant ce fichier (ex: plugin.yaml)"),
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Liste les repos GitHub publics du compte lié. Si manifest est fourni, ne retourne que les repos contenant ce fichier."""
        async with db.session() as session:
            try:
                return await GitHubService(session).list_repos(
                    user_id=user["sub"],
                    per_page=min(per_page, 100),
                    page=page,
                    sort=sort,
                    manifest=manifest,
                )
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))

    # ── RBAC : submissions:write ──────────────────────────────────────────────

    @router.post("/publish", response_model=SubmissionOut, status_code=status.HTTP_202_ACCEPTED)
    async def publish_from_github(
        body: SubmitGitHubRequest,
        category_ids: list[str] = Query(default=[]),
        user: AuthPayload = Depends(require_permission("submissions:write")),
    ) -> Any:
        """
        Télécharge le ZIP du repo GitHub lié et lance le pipeline en tâche Celery.
        Répond immédiatement 202. Utiliser GET /submissions/{id} pour suivre l'état.
        Requiert la permission submissions:write.
        """
        # Télécharge le ZIP dans le dossier persistant (le worker y accède)
        async with db.session() as session:
            try:
                zip_path = await GitHubService(session).download_repo_zip(
                    user_id=user["sub"],
                    repo_owner=body.repo_owner,
                    repo_name=body.repo_name,
                    branch=body.branch,
                    dest_dir=_UPLOAD_DIR,
                )
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))

        plugin_name = body.repo_name
        plugin_version = body.plugin_version
        merged_category_ids = list({*body.category_ids, *category_ids})

        # Crée la soumission en DB avec status "pending" — répond immédiatement
        async with db.session() as session:
            import json as _json
            sub = Submission(
                developer_id=user["sub"],
                plugin_name=plugin_name,
                plugin_version=plugin_version,
                status="pending",
                source="github",
                github_repo=f"{body.repo_owner}/{body.repo_name}",
                github_branch=body.branch,
                category_ids=_json.dumps(merged_category_ids) if merged_category_ids else None,
            )
            session.add(sub)
            await session.commit()
            await session.refresh(sub)

        # Notifie le dev que la soumission est reçue
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
            async with db.session() as session:
                s = await session.get(Submission, sub.id)
                if s:
                    s.status = "failed"
                    await session.commit()
            raise HTTPException(status_code=503, detail=f"Worker indisponible : {exc}")

        return sub

    return router
