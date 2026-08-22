from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import DateTime, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class PluginDoc(Base):
    __tablename__ = "market_plugin_docs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    plugin_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    version: Mapped[str] = mapped_column(String(64), nullable=False)

    readme: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    integration: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    contributor: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    extracted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("plugin_id", "version", name="uq_plugin_doc_version"),
    )
