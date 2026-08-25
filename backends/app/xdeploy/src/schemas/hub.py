"""Schémas calqués EXACTEMENT sur le contrat consommé par
xcore_agent/agent/hub_client.py (HttpHubClient) côté xcore-agent — noms de
champs, encodage base64 des binaires, tout doit matcher au caractère près
pour que `xcore-agent deploy`/`build` marchent sans modification.
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel


class AuthRequest(BaseModel):
    xdevkey: str
    project_id: str


class AuthResponse(BaseModel):
    access_token: str


class LatestVersionResponse(BaseModel):
    version: str


class ArtifactLocationResponse(BaseModel):
    download_url: str
    signature: str  # base64
    signer_public_key: str  # base64


class AuthorizeRequest(BaseModel):
    deployment_credential: str
    artifact_signature: str  # base64


class AuthorizeResponse(BaseModel):
    dek: str  # base64


class DeploymentReportRequest(BaseModel):
    project_id: str
    deployment_id: str
    status: str
    version: str
    started_at: str
    completed_at: str
    plugins: list[dict[str, Any]] = []


class DeploymentReportResponse(BaseModel):
    deployment_id: str


class PublishResponse(BaseModel):
    """Pas dans le contrat proposé côté agent (qui ne documente que le
    téléchargement, pas la publication) — c'est le pendant naturel de
    packer.builder.BuildResult côté xcore-agent."""

    artifact_id: str
    project_id: str
    version: str
    content_sha256: str
    size_bytes: int
    created_at: str
