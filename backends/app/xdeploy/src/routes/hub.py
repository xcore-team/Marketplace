"""Implémente le contrat consommé par xcore_agent/agent/hub_client.py
(HttpHubClient) — voir schemas/hub.py pour le rappel de fidélité au contrat.
Plus une route de publication (POST /v1/projects/{project_id}/publish), le
pendant naturel côté Hub de packer.builder.build_artifact côté agent, absente
du contrat proposé (qui ne documentait que le téléchargement).
"""
from __future__ import annotations

import base64
import hashlib
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Request, UploadFile, status
from fastapi.responses import Response

from ..schemas.hub import (
    ArtifactLocationResponse,
    AuthorizeRequest,
    AuthorizeResponse,
    AuthRequest,
    AuthResponse,
    DeploymentReportRequest,
    DeploymentReportResponse,
    LatestVersionResponse,
    PublishResponse,
)
from ..services.artifact import ArtifactService
from ..services.kek import KekError, unwrap_dek, wrap_dek
from ..services.token import SessionClaims, TokenError, issue, verify


def _b64d(value: str, field: str) -> bytes:
    try:
        return base64.b64decode(value)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"{field} n'est pas du base64 valide") from exc


def hub_router(db: Any, ctx: Any, kek: bytes, session_secret: bytes, storage: Any) -> APIRouter:
    router = APIRouter(prefix="/v1", tags=["xdeploy-hub"])

    async def _current_session(
        authorization: str = Header(..., description="Bearer <access_token> de POST /v1/auth"),
    ) -> SessionClaims:
        if not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="En-tête Authorization: Bearer <token> requis")
        try:
            return verify(session_secret, authorization.removeprefix("Bearer "))
        except TokenError as exc:
            raise HTTPException(status_code=401, detail=str(exc))

    def _require_project_match(claims: SessionClaims, project_id: str) -> None:
        if claims.project_id != project_id:
            raise HTTPException(
                status_code=403,
                detail=f"Ce jeton de session est rattaché au projet '{claims.project_id}', pas '{project_id}'.",
            )

    # ── Auth ─────────────────────────────────────────────────────────────────

    @router.post("/auth", response_model=AuthResponse)
    async def auth(body: AuthRequest) -> Any:
        response = await ctx("xdevkeys", "devkeys.authenticate", {"raw_key": body.xdevkey})
        if response.get("status") != "ok":
            raise HTTPException(status_code=401, detail="xdevkey invalide ou révoquée")
        if response.get("project_id") is None:
            raise HTTPException(
                status_code=403,
                detail="Cette clé n'est rattachée à aucun projet — créez un projet "
                "kind=xdeploy (POST /xdevkeys/projects) et une clé pour ce projet.",
            )
        if response.get("project_kind") != "xdeploy" or response.get("project_slug") != body.project_id:
            raise HTTPException(
                status_code=403,
                detail=f"Cette clé est rattachée au projet '{response.get('project_slug')}', "
                f"pas '{body.project_id}'.",
            )
        token = issue(
            session_secret, project_id=body.project_id, publisher_id=response["user_id"]
        )
        return AuthResponse(access_token=token)

    # ── Publication (nouveau — pas dans le contrat proposé côté agent) ────────

    @router.post(
        "/projects/{project_id}/publish",
        response_model=PublishResponse,
        status_code=status.HTTP_201_CREATED,
    )
    async def publish(
        project_id: str,
        version: str = Form(...),
        project_name: str = Form(...),
        content_sha256: str = Form(...),
        dek: str = Form(..., description="DEK de l'artefact, base64 — voir packer.builder.BuildResult"),
        signature: str = Form(..., description="Signature Ed25519 du ciphertext, base64"),
        signer_public_key: str = Form(..., description="Clé publique Ed25519 du signataire, base64"),
        artifact: UploadFile = File(..., description="Le fichier .xdeploy scellé (packer output_path)"),
        x_api_key: str = Header(..., alias="X-API-Key", description="xdevkey (xdk_...)"),
    ) -> Any:
        """Publie un nouvel artefact `.xdeploy` — authentifié par xdevkey (pas
        par jeton de session : la publication est un acte local de build, pas
        un déploiement, xcore-agent n'a pas forcément déjà appelé /v1/auth à
        ce stade)."""
        response = await ctx("xdevkeys", "devkeys.authenticate", {"raw_key": x_api_key})
        if response.get("status") != "ok":
            raise HTTPException(status_code=401, detail="xdevkey invalide ou révoquée")
        if response.get("project_kind") != "xdeploy" or response.get("project_slug") != project_id:
            raise HTTPException(
                status_code=403,
                detail=f"Cette clé n'est pas rattachée au projet '{project_id}'.",
            )

        ciphertext = await artifact.read()
        computed_sha256 = hashlib.sha256(ciphertext).hexdigest()
        # Ce hash porte sur le CIPHERTEXT reçu, pas sur content_sha256 (celui
        # du manifest, calculé sur l'arbre en clair côté packer) — juste une
        # garantie que l'upload n'a pas été tronqué/corrompu en transit.
        if len(ciphertext) < 12:
            raise HTTPException(status_code=400, detail="Artefact invalide (trop court)")

        dek_bytes = _b64d(dek, "dek")
        if len(dek_bytes) != 32:
            raise HTTPException(status_code=400, detail="dek doit faire 32 octets (AES-256)")
        dek_wrapped = wrap_dek(dek_bytes, kek)

        async with db.session() as session:
            svc = ArtifactService(session, storage)
            try:
                record = await svc.publish(
                    project_id=project_id,
                    project_name=project_name,
                    version=version,
                    publisher_id=response["user_id"],
                    ciphertext=ciphertext,
                    content_sha256=content_sha256,
                    dek_wrapped=dek_wrapped,
                    signature_hex=_b64d(signature, "signature").hex(),
                    signer_public_key_hex=_b64d(signer_public_key, "signer_public_key").hex(),
                )
            except ValueError as exc:
                raise HTTPException(status_code=409, detail=str(exc))
            await session.commit()
            await session.refresh(record)

        return PublishResponse(
            artifact_id=record.id,
            project_id=record.project_id,
            version=record.version,
            content_sha256=computed_sha256,
            size_bytes=record.size_bytes,
            created_at=record.created_at.isoformat(),
        )

    # ── Résolution / téléchargement ────────────────────────────────────────

    @router.get("/projects/{project_id}/versions/latest", response_model=LatestVersionResponse)
    async def latest_version(
        project_id: str, claims: SessionClaims = Depends(_current_session)
    ) -> Any:
        _require_project_match(claims, project_id)
        async with db.session() as session:
            record = await ArtifactService(session, storage).latest(project_id)
        if record is None:
            raise HTTPException(status_code=404, detail=f"Aucun artefact publié pour '{project_id}'")
        return LatestVersionResponse(version=record.version)

    @router.get(
        "/projects/{project_id}/artifacts/{version}", response_model=ArtifactLocationResponse
    )
    async def request_artifact(
        project_id: str,
        version: str,
        request: Request,
        claims: SessionClaims = Depends(_current_session),
    ) -> Any:
        _require_project_match(claims, project_id)
        async with db.session() as session:
            record = await ArtifactService(session, storage).get(project_id, version)
        if record is None:
            raise HTTPException(
                status_code=404, detail=f"Version '{version}' introuvable pour '{project_id}'"
            )
        download_url = str(request.base_url).rstrip("/") + f"/app/xdeploy/v1/artifacts/{record.id}/download"
        return ArtifactLocationResponse(
            download_url=download_url,
            signature=base64.b64encode(bytes.fromhex(record.signature)).decode("ascii"),
            signer_public_key=base64.b64encode(bytes.fromhex(record.signer_public_key)).decode("ascii"),
        )

    @router.get("/artifacts/{artifact_id}/download")
    async def download_artifact(artifact_id: str) -> Response:
        """Public, sans auth — le ciphertext seul est inutilisable sans le DEK
        (voir /v1/deployments/authorize), donc masquer cette URL n'ajoute rien ;
        c'est exactement l'hypothèse que fait HttpHubClient.download() côté
        agent (pas d'en-tête d'auth sur cet appel)."""
        async with db.session() as session:
            record = await ArtifactService(session, storage).get_by_id(artifact_id)
            if record is None:
                raise HTTPException(status_code=404, detail="Artefact introuvable")
            ciphertext = await ArtifactService(session, storage).read_ciphertext(record)
        return Response(content=ciphertext, media_type="application/octet-stream")

    # ── Déploiement ──────────────────────────────────────────────────────────

    @router.post("/deployments/authorize", response_model=AuthorizeResponse)
    async def authorize(
        body: AuthorizeRequest, claims: SessionClaims = Depends(_current_session)
    ) -> Any:
        valid = await ctx(
            "xdevkeys",
            "devkeys.verify_deployment_credential",
            {"project_id": claims.project_id, "deployment_credential": body.deployment_credential},
        )
        if valid.get("status") != "ok" or not valid.get("valid"):
            raise HTTPException(status_code=401, detail="deployment_credential invalide ou révoqué")

        signature_hex = _b64d(body.artifact_signature, "artifact_signature").hex()
        async with db.session() as session:
            record = await ArtifactService(session, storage).get_by_signature(claims.project_id, signature_hex)
        if record is None:
            raise HTTPException(status_code=404, detail="Aucun artefact ne correspond à cette signature")

        try:
            dek = unwrap_dek(record.dek_wrapped, kek)
        except KekError as exc:
            raise HTTPException(status_code=500, detail=str(exc))
        return AuthorizeResponse(dek=base64.b64encode(dek).decode("ascii"))

    @router.post("/deployments/report", response_model=DeploymentReportResponse)
    async def report(
        body: DeploymentReportRequest, claims: SessionClaims = Depends(_current_session)
    ) -> Any:
        _require_project_match(claims, body.project_id)
        deployment_id = await _log_deployment(db, claims, body)
        return DeploymentReportResponse(deployment_id=deployment_id)

    return router


async def _log_deployment(db: Any, claims: SessionClaims, body: DeploymentReportRequest) -> str:
    """Écrit dans xdep_deployments (app/xdeployments) — même table que le flux
    marketplace, kind="xdeploy", pour une vue admin unifiée. Best-effort :
    voir MarketplaceDeploymentRunner._report_to_hub côté agent, mais ici
    c'est le SERVEUR qui doit rester tolérant, pas l'inverse — une écriture
    ratée ne doit jamais faire échouer l'accusé de réception au client."""
    from sqlalchemy import text as sql_text
    from uuid import uuid4
    from datetime import datetime

    deployment_id = str(uuid4())
    # started_at/completed_at : DeploymentRunner._notify() côté xcore-agent
    # les envoie actuellement toujours vides (gap connu, pas corrigé ici) —
    # on utilise l'heure serveur plutôt que de risquer un DateTime NOT NULL
    # avec une chaîne vide/mal formée.
    now = datetime.utcnow()
    try:
        async with db.session() as session:
            await session.execute(
                sql_text(
                    "INSERT INTO xdep_deployments "
                    "(id, deployer_id, kind, slug, version, host_id, status, repo, "
                    "error_message, started_at, completed_at, created_at) "
                    "VALUES (:id, :deployer_id, 'xdeploy', :slug, :version, 'default', "
                    ":status, NULL, NULL, :started_at, :completed_at, :created_at)"
                ),
                {
                    "id": deployment_id,
                    "deployer_id": claims.publisher_id,
                    "slug": body.project_id,
                    "version": body.version,
                    "status": body.status,
                    "started_at": now,
                    "completed_at": now,
                    "created_at": now,
                },
            )
            await session.commit()
    except Exception:
        pass
    return deployment_id
