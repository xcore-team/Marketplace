from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class DeveloperGitHubToken(Base):
    __tablename__ = "market_github_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), unique=True, nullable=False, index=True)
    github_login: Mapped[str] = mapped_column(String(128), nullable=False)
    github_user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    scopes: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    linked_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
