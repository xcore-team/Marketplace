from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, Table, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


service_category_table = Table(
    "xsvc_service_categories",
    Base.metadata,
    Column("service_id", String(36), ForeignKey("xsvc_services.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", String(36), ForeignKey("xsvc_categories.id", ondelete="CASCADE"), primary_key=True),
)


class ServiceCategory(Base):
    __tablename__ = "xsvc_categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    services: Mapped[List["Service"]] = relationship(
        "Service", secondary=service_category_table, back_populates="categories"
    )


class Service(Base):
    """Extension de service publiée dans le marketplace."""
    __tablename__ = "xsvc_services"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    developer_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Classe Python exposée : "extensions.mypkg.main:MyService"
    entry_class: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    homepage: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    repository: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    # "public" | "private" — même sémantique que Plugin.visibility (app marketplace)
    visibility: Mapped[str] = mapped_column(String(16), default="public")
    tenant_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    avg_rating: Mapped[float] = mapped_column(Float, default=0.0)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    install_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    versions: Mapped[List["ServiceVersion"]] = relationship(
        "ServiceVersion", back_populates="service", cascade="all, delete-orphan",
        order_by="ServiceVersion.created_at.desc()",
    )
    ratings: Mapped[List["ServiceRating"]] = relationship(
        "ServiceRating", back_populates="service", cascade="all, delete-orphan",
    )
    categories: Mapped[List["ServiceCategory"]] = relationship(
        "ServiceCategory", secondary=service_category_table, back_populates="services"
    )


class ServiceVersion(Base):
    __tablename__ = "xsvc_service_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    service_id: Mapped[str] = mapped_column(String(36), ForeignKey("xsvc_services.id", ondelete="CASCADE"), nullable=False)
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    merkle_root: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    anomaly_score: Mapped[int] = mapped_column(Integer, default=0)
    is_stable: Mapped[bool] = mapped_column(Boolean, default=False)
    changelog: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_yanked: Mapped[bool] = mapped_column(Boolean, default=False)
    yanked_reason: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    # auto_published | manual_review | rejected | yanked
    publish_status: Mapped[str] = mapped_column(String(32), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("service_id", "version", name="uq_service_version"),
        Index("ix_svc_version_service_id", "service_id"),
    )

    service: Mapped["Service"] = relationship("Service", back_populates="versions")


class ServiceSubmission(Base):
    __tablename__ = "xsvc_submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    developer_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    service_name: Mapped[str] = mapped_column(String(128), nullable=False)
    service_version: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    anomaly_score: Mapped[int] = mapped_column(Integer, default=0)
    report_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category_ids: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    github_repo: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    github_branch: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    # Utilisés uniquement à la création (première soumission) du Service — voir tasks.py
    visibility: Mapped[str] = mapped_column(String(16), default="public")
    tenant_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class ServiceRating(Base):
    __tablename__ = "xsvc_ratings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    service_id: Mapped[str] = mapped_column(String(36), ForeignKey("xsvc_services.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("service_id", "user_id", name="uq_service_rating_user"),
        Index("ix_svc_rating_service_id", "service_id"),
    )

    service: Mapped["Service"] = relationship("Service", back_populates="ratings")
