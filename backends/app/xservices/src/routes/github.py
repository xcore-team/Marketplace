from __future__ import annotations

import json
import logging
import tempfile
from pathlib import Path
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, model_validator
from xcore.kernel.api import AuthPayload, get_current_user
from xcore.sdk import require_permission

from ..models.service import ServiceSubmission
from ..schemas.submission import SubmissionOut

logger = logging.getLogger("hub.xservices.github")

_UPLOAD_DIR = Path(tempfile.gettempdir()) / "xcore_service_submissions"
_UPLOAD_DIR.mkdir(exist_ok=True)


class ServicePublishRequest(BaseModel):
    full_name: str
    tag: str  # tag Git publié — voir GET /app/marketplace/github/repos/{owner}/{repo}/tags
    service_version: str
    category_ids: List[str] = []
    visibility: str = "public"

    @model_validator(mode="after")
    def _validate(self) -> "ServicePublishRequest":
        if len(self.full_name.split("/", 1)) != 2:
            raise ValueError("full_name doit être au format 'owner/repo'")
        if not self.tag.strip():
            raise ValueError("tag ne peut pas être vide — le déploiement est forcé sur un tag Git")
        if self.visibility not in ("public", "private"):
            raise ValueError("visibility doit être 'public' ou 'private'")
        return self


async def _submit_service_github_tag(
    db: Any,
    events: Any,
    secret_key: bytes,
    *,
    developer_id: str,
    repo_owner: str,
    repo_name: str,
    tag: str,
    service_version: str,
    category_ids: List[str],
    visibility: str = "public",
    tenant_id: Optional[str] = None,
    source: str = "github",
) -> ServiceSubmission:
    """Cœur partagé : vérifie le tag, télécharge le ZIP, crée la ServiceSubmission,
    dispatch le pipeline Celery. Utilisé par /github/publish (JWT) et la route CI (X-API-Key)."""
    service_name = repo_name

    from app.marketplace.src.services.github import GitHubService as _GHService

    async with db.session() as session:
        try:
            tag_info = await _GHService(session).get_tag(
                user_id=developer_id, repo_owner=repo_owner, repo_name=repo_name, tag=tag
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    if tag_info is None:
        raise HTTPException(
            status_code=400,
            detail=f"Le tag '{tag}' n'existe pas sur {repo_owner}/{repo_name}.",
        )
    if tag not in (service_version, f"v{service_version}"):
        raise HTTPException(
            status_code=400,
            detail=f"Le tag '{tag}' ne correspond pas à la version '{service_version}'.",
        )

    # tenant_id vient du claim JWT de l'appelant (voir publish_service_from_github
    # ci-dessous), jamais du corps de la requête — pas de vérification
    # d'appartenance à faire, contrairement à l'ancien organization_id.

    try:
        async with db.session() as session:
            zip_path = await _GHService(session).download_repo_zip(
                user_id=developer_id,
                repo_owner=repo_owner,
                repo_name=repo_name,
                ref=tag,
                dest_dir=_UPLOAD_DIR,
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Impossible de télécharger le repo : {exc}")

    async with db.session() as session:
        sub = ServiceSubmission(
            developer_id=developer_id,
            service_name=service_name,
            service_version=service_version,
            status="pending",
            source=source,
            github_repo=f"{repo_owner}/{repo_name}",
            github_branch=tag,
            category_ids=json.dumps(category_ids) if category_ids else None,
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
                "user_id": developer_id,
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
                developer_id=developer_id,
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


def service_github_router(db: Any, events: Any, secret_key: bytes = b"", ctx: Any = None) -> APIRouter:
    router = APIRouter(prefix="/github", tags=["xservices-github"])

    @router.post("/publish", response_model=SubmissionOut, status_code=status.HTTP_202_ACCEPTED)
    async def publish_service_from_github(
        body: ServicePublishRequest,
        user: AuthPayload = Depends(require_permission("services:write")),
    ) -> Any:
        """
        Télécharge le ZIP depuis GitHub **au tag publié** et soumet l'extension de service.
        Réutilise le compte GitHub lié depuis le marketplace (même token, même app GitHubService).
        Le tag doit exister sur le dépôt et correspondre à service_version
        ('1.0.0' ou 'v1.0.0'), sinon 400.
        """
        repo_owner, repo_name = body.full_name.split("/", 1)
        return await _submit_service_github_tag(
            db, events, secret_key,
            developer_id=user["sub"],
            repo_owner=repo_owner,
            repo_name=repo_name,
            tag=body.tag,
            service_version=body.service_version.strip(),
            category_ids=body.category_ids,
            visibility=body.visibility,
            tenant_id=(user.get("tenant_id") or (user.get("user") or {}).get("tenant_id")),
            source="github",
        )

    # ── CI (X-API-Key) ───────────────────────────────────────────────────────

    @router.post(
        "/repos/{owner}/{repo}/tags/{tag}/recompute",
        response_model=SubmissionOut,
        status_code=status.HTTP_202_ACCEPTED,
    )
    async def recompute_service_from_ci(
        owner: str,
        repo: str,
        tag: str,
        service_version: Optional[str] = Query(
            None, description="Par défaut : le tag lui-même (sans préfixe 'v')"
        ),
        x_api_key: str = Header(..., alias="X-API-Key", description="Clé API xcore (xdk_...)"),
    ) -> Any:
        """Équivalent de /github/publish pour un CI (push de tag) — voir la route
        homologue du marketplace pour le template GitHub Actions."""
        from middleware.submission_limit import check_rate_limit

        from .install import _resolve_api_key

        developer_id = await _resolve_api_key(x_api_key, ctx)

        allowed, retry_after = check_rate_limit(
            "ci_recompute", developer_id, max_calls=20, period_seconds=3600
        )
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="Limite de recompute CI atteinte (20/heure). Réessayez plus tard.",
                headers={"Retry-After": str(retry_after)},
            )

        version = service_version or tag.removeprefix("v")
        return await _submit_service_github_tag(
            db, events, secret_key,
            developer_id=developer_id,
            repo_owner=owner,
            repo_name=repo,
            tag=tag,
            service_version=version,
            category_ids=[],
            source="ci",
        )

    @router.get("/repos/{owner}/{repo}/ci-workflow")
    async def ci_workflow_template(
        owner: str,
        repo: str,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Génère un template GitHub Actions (`.github/workflows/xcore-publish.yml`)
        pour une extension de service — même mécanisme que le marketplace
        (voir app/marketplace/src/routes/github.py::ci_workflow_template),
        pointé vers /app/xservices/... au lieu de /app/marketplace/....
        Le développeur commite ce fichier dans son propre dépôt : à chaque
        `git push --tags`, le workflow appelle `POST .../tags/{tag}/recompute`
        avec sa clé API (stockée comme secret de dépôt GitHub, `XCORE_API_KEY`).
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
      - name: Notify xservices
        run: |
          TAG="${{GITHUB_REF_NAME}}"
          curl -sS -X POST \\
            -H "X-API-Key: ${{{{ secrets.XCORE_API_KEY }}}}" \\
            "${{XCORE_MARKETPLACE_URL:-https://marketplace.xcorehub.dev}}/app/xservices/github/repos/{owner}/{repo}/tags/$TAG/recompute" \\
            --fail-with-body
"""
        return {"filename": ".github/workflows/xcore-publish.yml", "content": yaml_text}

    return router
