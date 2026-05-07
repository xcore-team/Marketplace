from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from .category import CategoryOut


class PluginCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=128)
    description: Optional[str] = None
    homepage: Optional[str] = None
    repository: Optional[str] = None
    category_ids: List[str] = []


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
    is_published: bool
    avg_rating: float = 0.0
    rating_count: int = 0
    created_at: datetime
    versions: List[PluginVersionOut] = []
    categories: List[CategoryOut] = []

    model_config = {"from_attributes": True}
