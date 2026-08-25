from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Submission(Base):
    __tablename__ = "market_submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    developer_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    plugin_name: Mapped[str] = mapped_column(String(128), nullable=False)
    plugin_version: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    anomaly_score: Mapped[int] = mapped_column(Integer, default=0)
    report_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(32), default="upload")
    github_repo: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    github_branch: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    category_ids: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON list of category UUIDs
    # "public" | "private" — même sémantique que Plugin.visibility, reportée
    # sur le Plugin créé/mis à jour en fin de pipeline (voir tasks.py). Absent
    # jusqu'ici : PluginService.create() acceptait déjà ce paramètre (utilisé
    # côté ServiceSubmission/xservices) mais rien ne le renseignait pour les
    # plugins — toute publication finissait "public" quel que soit le choix.
    visibility: Mapped[str] = mapped_column(String(16), default="public")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
