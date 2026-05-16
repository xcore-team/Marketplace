from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Generic, List, Optional, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class PageOut(BaseModel, Generic[T]):
    items: List[T]
    total: int
    limit: int
    offset: int
    has_more: bool


# ── Utilisateurs ──────────────────────────────────────────────────────────────

class UserAdminOut(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None
    github_login: Optional[str] = None
    is_active: bool
    mfa_enabled: bool
    created_at: datetime
    plugin_count: int = 0
    submission_count: int = 0
    roles: List[str] = []

    model_config = {"from_attributes": True}


class UserGitHubOut(BaseModel):
    github_login: str
    github_user_id: str
    linked_at: datetime

    model_config = {"from_attributes": True}


class UserBanRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=256)


class UserRoleAssign(BaseModel):
    role_id: str
    tenant_id: str


# ── Plugins ───────────────────────────────────────────────────────────────────

class PluginAdminOut(BaseModel):
    id: str
    name: str
    slug: str
    developer_id: str
    developer_email: Optional[str] = None
    is_published: bool
    avg_rating: float
    rating_count: int
    version_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Soumissions ───────────────────────────────────────────────────────────────

class SubmissionAdminOut(BaseModel):
    id: str
    developer_id: str
    developer_email: Optional[str] = None
    plugin_name: str
    plugin_version: str
    status: str
    source: str
    anomaly_score: Optional[int] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Catégories ────────────────────────────────────────────────────────────────

class CategoryAdminCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    slug: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class CategoryAdminUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


# ── Stats globales ────────────────────────────────────────────────────────────

class GlobalStatsOut(BaseModel):
    users_total: int
    users_active: int
    plugins_total: int
    plugins_published: int
    submissions_total: int
    submissions_pending: int
    submissions_approved: int
    submissions_rejected: int
    submissions_manual_review: int
    categories_total: int


# ── Broadcast ─────────────────────────────────────────────────────────────────

class BroadcastRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=1000)
    event: str = Field("ADMIN_BROADCAST", max_length=64)


# ── Audit ─────────────────────────────────────────────────────────────────────

class AuditLogOut(BaseModel):
    id: str
    user_id: Optional[str] = None
    action: str
    resource: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
