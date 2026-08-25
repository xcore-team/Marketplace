from __future__ import annotations

import json as _json
import logging
import tempfile
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel
from xcore.kernel.api import AuthPayload, get_current_user
from xcore.sdk import require_permission

from sandbox import SandboxLimits

from middleware.submission_limit import check_rate_limit

from ..models.submission import Submission
from ..schemas.submission import SubmissionOut, SubmitGitHubRequest
from ..services.github import GitHubService
from .install import _resolve_api_key

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


async def _submit_github_tag(
    db: Any,
    events: Any,
    secret_key: bytes,
    limits: SandboxLimits,
    *,
    developer_id: str,
    repo_owner: str,
    repo_name: str,
    tag: str,
    plugin_version: str,
    category_ids: list[str],
    source: str = "github",
    visibility: str = "public",
) -> Submission:
    """
    Cœur partagé de la soumission GitHub : vérifie le tag, télécharge le ZIP,
    crée la Submission, dispatch le pipeline Celery. Utilisé par la route
    interactive (POST /github/publish, JWT) et par la route CI (X-API-Key).
    """
    async with db.session() as session:
        try:
            tag_info = await GitHubService(session).get_tag(
                user_id=developer_id, repo_owner=repo_owner, repo_name=repo_name, tag=tag
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if tag_info is None:
        raise HTTPException(
            status_code=400,
            detail=f"Le tag '{tag}' n'existe pas sur {repo_owner}/{repo_name}. "
            "Le déploiement doit être fait depuis un tag Git existant.",
        )
    if tag not in (plugin_version, f"v{plugin_version}"):
        raise HTTPException(
            status_code=400,
            detail=f"Le tag '{tag}' ne correspond pas à la version '{plugin_version}' "
            f"(attendu : '{plugin_version}' ou 'v{plugin_version}').",
        )

    async with db.session() as session:
        try:
            zip_path = await GitHubService(session).download_repo_zip(
                user_id=developer_id,
                repo_owner=repo_owner,
                repo_name=repo_name,
                ref=tag,
                dest_dir=_UPLOAD_DIR,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    plugin_name = repo_name

    async with db.session() as session:
        sub = Submission(
            developer_id=developer_id,
            plugin_name=plugin_name,
            plugin_version=plugin_version,
            status="pending",
            source=source,
            github_repo=f"{repo_owner}/{repo_name}",
            github_branch=tag,
            category_ids=_json.dumps(category_ids) if category_ids else None,
            visibility=visibility,
        )
        session.add(sub)
        await session.commit()
        await session.refresh(sub)

    if events:
        try:
            await events.emit("ext.notification.publish", {
                "channel": "notification",
                "user_id": developer_id,
                "event": "SUBMISSION_RECEIVED",
                "submission_id": sub.id,
                "plugin_name": plugin_name,
            })
        except Exception as exc:
            logger.warning("Emit SUBMISSION_RECEIVED échoué : %s", exc)

    try:
        from xcore.sdk import task_registry
        task_registry["marketplace.process_submission"].apply_async(
            kwargs=dict(
                submission_id=sub.id,
                developer_id=developer_id,
                zip_path=str(zip_path),
                plugin_name=plugin_name,
                plugin_version=plugin_version,
                secret_key=secret_key.decode("latin-1") if secret_key else "",
                db_url=str(db.engine.url),
                sandbox_memory_mb=limits.memory_mb,
                sandbox_cpu_seconds=limits.cpu_seconds,
                sandbox_timeout=limits.timeout,
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


def github_router(
    db: Any,
    events: Any,
    secret_key: bytes = b"",
    limits: SandboxLimits | None = None,
    ctx: Any = None,
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

    @router.get("/repos/{owner}/{repo}/tags")
    async def list_repo_tags(
        owner: str,
        repo: str,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Liste les tags Git d'un repo lié — utilisé pour choisir le tag à publier."""
        async with db.session() as session:
            try:
                return await GitHubService(session).list_tags(
                    user_id=user["sub"], repo_owner=owner, repo_name=repo
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
        Le déploiement est forcé sur un tag Git — le tag doit exister sur le repo et
        correspondre à plugin_version (ou 'v{plugin_version}').
        Répond immédiatement 202. Utiliser GET /submissions/{id} pour suivre l'état.
        Requiert la permission submissions:write.
        """
        merged_category_ids = list({*body.category_ids, *category_ids})
        return await _submit_github_tag(
            db, events, secret_key, _limits,
            developer_id=user["sub"],
            repo_owner=body.repo_owner,
            repo_name=body.repo_name,
            tag=body.tag,
            plugin_version=body.plugin_version,
            category_ids=merged_category_ids,
            source="github",
            visibility=body.visibility,
        )

    # ── CI (X-API-Key) ───────────────────────────────────────────────────────

    @router.post(
        "/repos/{owner}/{repo}/tags/{tag}/recompute",
        response_model=SubmissionOut,
        status_code=status.HTTP_202_ACCEPTED,
    )
    async def recompute_from_ci(
        owner: str,
        repo: str,
        tag: str,
        plugin_version: Optional[str] = Query(
            None, description="Par défaut : le tag lui-même (sans préfixe 'v')"
        ),
        x_api_key: str = Header(..., alias="X-API-Key", description="Clé API xcore (xdk_...)"),
    ) -> Any:
        """
        Endpoint pensé pour un CI déclenché par un push de tag sur le repo du
        développeur (voir GET /github/repos/{owner}/{repo}/ci-workflow pour un
        template GitHub Actions). Authentifié par clé API (pas de session JWT
        disponible depuis un runner CI). Revérifie le tag et relance le pipeline
        exactement comme /github/publish.
        """
        developer_id = await _resolve_api_key(x_api_key, db, ctx)

        allowed, retry_after = check_rate_limit(
            "ci_recompute", developer_id, max_calls=20, period_seconds=3600
        )
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="Limite de recompute CI atteinte (20/heure). Réessayez plus tard.",
                headers={"Retry-After": str(retry_after)},
            )

        version = plugin_version or tag.removeprefix("v")
        return await _submit_github_tag(
            db, events, secret_key, _limits,
            developer_id=developer_id,
            repo_owner=owner,
            repo_name=repo,
            tag=tag,
            plugin_version=version,
            category_ids=[],
            source="ci",
        )

    @router.get("/repos/{owner}/{repo}/ci-workflow")
    async def ci_workflow_template(
        owner: str,
        repo: str,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """
        Génère un template GitHub Actions à commiter dans .github/workflows/ du
        repo — republie automatiquement sur le marketplace à chaque push de tag.
        Le développeur doit stocker sa clé API xcore (xdk_...) comme secret du
        repo (Settings → Secrets and variables → Actions), nommé XCORE_API_KEY.
        """
        yaml_text = f"""\
name: Publish to xcore marketplace

on:
  push:
    tags:
      - "*"

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Notify xcore marketplace
        run: |
          TAG="${{GITHUB_REF_NAME}}"
          curl -sS -X POST \\
            -H "X-API-Key: ${{{{ secrets.XCORE_API_KEY }}}}" \\
            "${{XCORE_MARKETPLACE_URL:-https://marketplace.xcorehub.dev}}/app/marketplace/github/repos/{owner}/{repo}/tags/$TAG/recompute" \\
            --fail-with-body
"""
        return {"filename": ".github/workflows/xcore-publish.yml", "content": yaml_text}

    return router
