from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, Table, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


# Table d'association Plugin <-> Category (many-to-many)
plugin_category_table = Table(
    "market_plugin_categories",
    Base.metadata,
    Column("plugin_id", String(36), ForeignKey("market_plugins.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", String(36), ForeignKey("market_categories.id", ondelete="CASCADE"), primary_key=True),
)


class Category(Base):
    __tablename__ = "market_categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    plugins: Mapped[List["Plugin"]] = relationship(
        "Plugin", secondary=plugin_category_table, back_populates="categories"
    )


class Plugin(Base):
    __tablename__ = "market_plugins"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    developer_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    homepage: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    repository: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    # "public" | "private" — un plugin privé n'est visible que par son propriétaire
    # et les membres de l'équipe propriétaire (tenant_id, app/auth), le cas échéant.
    visibility: Mapped[str] = mapped_column(String(16), default="public")
    tenant_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    avg_rating: Mapped[float] = mapped_column(Float, default=0.0)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    download_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    versions: Mapped[List["PluginVersion"]] = relationship(
        "PluginVersion", back_populates="plugin", cascade="all, delete-orphan",
        order_by="PluginVersion.created_at.desc()",
    )
    ratings: Mapped[List["PluginRating"]] = relationship(  # type: ignore[name-defined]
        "PluginRating", back_populates="plugin", cascade="all, delete-orphan",
    )
    categories: Mapped[List["Category"]] = relationship(
        "Category", secondary=plugin_category_table, back_populates="plugins"
    )


class PluginVersion(Base):
    __tablename__ = "market_plugin_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    plugin_id: Mapped[str] = mapped_column(String(36), ForeignKey("market_plugins.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    merkle_root: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    anomaly_score: Mapped[int] = mapped_column(Integer, default=0)
    is_stable: Mapped[bool] = mapped_column(Boolean, default=False)
    # Versionnage enrichi
    changelog: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_yanked: Mapped[bool] = mapped_column(Boolean, default=False)  # version retirée
    yanked_reason: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    publish_status: Mapped[str] = mapped_column(String(32), default="pending")  # auto_published | manual_review | rejected | yanked
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("plugin_id", "version", name="uq_plugin_version"),
        Index("ix_plugin_version_plugin_id", "plugin_id"),
    )

    plugin: Mapped["Plugin"] = relationship("Plugin", back_populates="versions")
