from __future__ import annotations

import shutil
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from xcore.kernel.api import AuthPayload, get_current_user
from xcore.sdk import require_permission

from sandbox import SandboxLimits

from ..notifications.pipeline import NotificationPipeline
from ..schemas.submission import SubmissionOut, SubmitGitHubRequest
from ..services.github import GitHubService
from ..services.submission import SubmissionService


class LinkGitHubRequest(BaseModel):
    access_token: str


class GitHubAccountOut(BaseModel):
    github_login: str
    github_user_id: str
    scopes: str | None
    linked: bool = True


def github_router(
    db: Any,
    notifications: NotificationPipeline,
    secret_key: bytes = b"",
    limits: SandboxLimits | None = None,
) -> APIRouter:
    router = APIRouter(prefix="/github", tags=["github"])
    _limits = limits or SandboxLimits()

    def _developer_email(user: AuthPayload) -> str:
        return (user.get("user") or {}).get("email") or user["sub"]

    def _svc(session, user: AuthPayload) -> SubmissionService:
        return SubmissionService(
            session=session,
            notifications=notifications,
            developer_email=_developer_email(user),
            limits=_limits,
        )

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
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
                )

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

    # ── RBAC : submissions:write ──────────────────────────────────────────────

    @router.post(
        "/publish", response_model=SubmissionOut, status_code=status.HTTP_202_ACCEPTED
    )
    async def publish_from_github(
        body: SubmitGitHubRequest,
        user: AuthPayload = Depends(require_permission("submissions:write")),
    ) -> Any:
        """
        Télécharge le ZIP du repo GitHub lié et lance le pipeline de validation.
        Requiert la permission submissions:write.
        """
        async with db.session() as session:
            try:
                zip_path = await GitHubService(session).download_repo_zip(
                    user_id=user["sub"],
                    repo_owner=body.repo_owner,
                    repo_name=body.repo_name,
                    branch=body.branch,
                )
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))

        try:
            async with db.session() as session:
                sub = await _svc(session, user).submit_zip(
                    developer_id=user["sub"],
                    zip_path=zip_path,
                    plugin_name=body.repo_name,
                    plugin_version=body.plugin_version,
                    secret_key=secret_key,
                    source="github",
                    github_repo=f"{body.repo_owner}/{body.repo_name}",
                )
                await session.commit()
                return sub
        finally:
            shutil.rmtree(zip_path.parent, ignore_errors=True)

    return router
