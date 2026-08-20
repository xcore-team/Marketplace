from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import DateTime, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base

STATUSES = ("success", "failed", "rolled_back")


class Deployment(Base):
    """Un événement de déploiement rapporté par xcore-agent.

    Une ligne par tentative (pas d'upsert) — c'est un journal, pas un état
    courant ; "l'état courant d'un host" se lit en prenant la ligne la plus
    récente pour (deployer_id, slug, host_id).
    """

    __tablename__ = "xdep_deployments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    # Le porteur de la clé API xdevkeys qui a fait le déploiement — pas
    # forcément le développeur propriétaire du plugin/extension (n'importe
    # quel opérateur peut déployer un plugin public et rapporter son statut).
    deployer_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(
        String(16), nullable=False
    )  # "plugin" | "service"
    slug: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    # Identifiant choisi par l'opérateur pour la cible (VPS, conteneur, ...) —
    # "default" si l'agent n'en fournit pas.
    host_id: Mapped[str] = mapped_column(String(128), nullable=False, default="default")
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    repo: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("ix_xdep_deployer_slug_host", "deployer_id", "slug", "host_id"),
    )
