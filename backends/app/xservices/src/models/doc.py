from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional
from uuid import uuid4

from sqlalchemy import DateTime, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class ServiceDoc(Base):
    __tablename__ = "xsvc_service_docs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    service_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    version: Mapped[str] = mapped_column(String(64), nullable=False)

    readme: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    integration: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    contributor: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    extracted_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("service_id", "version", name="uq_service_doc_version"),
    )
