from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import DateTime, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class XDeployArtifact(Base):
    """Un artefact `.xdeploy` scellé publié par un opérateur (xcore-agent
    build + publish). Le ciphertext lui-même vit sur disque (voir
    services/artifact.py — jamais en base, un artefact peut faire plusieurs
    Mo, et rien dans cet écosystème ne stocke de blob binaire en colonne DB) ;
    cette table ne garde que les métadonnées nécessaires pour le retrouver,
    le resservir et déverrouiller son DEK.
    """

    __tablename__ = "xdeploy_artifacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    # "prj_<hex>" — voir xdevkeys/services/project.py::_generate_xdeploy_slug.
    # Référence molle (pas de FK cross-plugin) vers devkeys_projects.slug,
    # même convention que xdep_deployments.slug.
    project_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    project_name: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    # Hex — nonce(12) + ciphertext AES-256-GCM du DEK, sous la KEK du Hub.
    # Le DEK en clair n'est JAMAIS persisté (voir services/kek.py).
    dek_wrapped: Mapped[str] = mapped_column(String(512), nullable=False)
    # Hex — signature Ed25519 (64 octets) sur le ciphertext de l'artefact.
    signature: Mapped[str] = mapped_column(String(256), nullable=False, index=True)
    # Hex — clé publique Ed25519 (32 octets) du signataire.
    signer_public_key: Mapped[str] = mapped_column(String(128), nullable=False)
    publisher_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("project_id", "version", name="uq_xdeploy_artifact_project_version"),
        Index("ix_xdeploy_artifact_project_created", "project_id", "created_at"),
    )
