from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, model_validator

from .category import CategoryOut


class PluginCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    description: Optional[str] = None
    homepage: Optional[str] = None
    repository: Optional[str] = None
    category_ids: List[str] = []
    visibility: str = "public"

    @model_validator(mode="after")
    def validate_visibility(self) -> "PluginCreate":
        if self.visibility not in ("public", "private"):
            raise ValueError("visibility doit être 'public' ou 'private'")
        return self


class VersionYankRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=256)


class PluginVersionOut(BaseModel):
    id: str
    version: str
    anomaly_score: int
    is_stable: bool
    is_yanked: bool = False
    yanked_reason: Optional[str] = None
    publish_status: str = "pending"
    changelog: Optional[str] = None
    merkle_root: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class PluginUpdate(BaseModel):
    description: Optional[str] = None
    homepage: Optional[str] = None
    repository: Optional[str] = None
    visibility: Optional[str] = None


class PluginAdminUpdate(BaseModel):
    is_published: Optional[bool] = None
    description: Optional[str] = None
    category_ids: Optional[List[str]] = None


class PluginOut(BaseModel):
    id: str
    developer_id: str
    name: str
    slug: str
    description: Optional[str]
    homepage: Optional[str]
    repository: Optional[str]
    visibility: str = "public"
    tenant_id: Optional[str] = None
    is_published: bool
    avg_rating: float = 0.0
    rating_count: int = 0
    download_count: int = 0
    latest_version: Optional[str] = None
    created_at: datetime
    versions: List[PluginVersionOut] = []
    categories: List[CategoryOut] = []
    dev_mail: Optional[str] = None

    model_config = {"from_attributes": True}

    @model_validator(mode="after")
    def compute_latest_version(self) -> "PluginOut":
        if self.latest_version is None and self.versions:
            self.latest_version = self.versions[0].version
        return self
