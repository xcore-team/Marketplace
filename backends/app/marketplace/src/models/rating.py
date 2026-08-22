from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class PluginRating(Base):
    __tablename__ = "market_plugin_ratings"
    __table_args__ = (
        UniqueConstraint("plugin_id", "user_id", name="uq_rating_plugin_user"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    plugin_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("market_plugins.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    score: Mapped[int] = mapped_column(Integer, nullable=False)  # 1–5
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    plugin: Mapped["Plugin"] = relationship("Plugin", back_populates="ratings")  # type: ignore[name-defined]
