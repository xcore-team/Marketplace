from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class CategoryOut(BaseModel):
    id: str
    name: str
    slug: str
    description: Optional[str] = None

    model_config = {"from_attributes": True}


class ServiceVersionOut(BaseModel):
    id: str
    version: str
    anomaly_score: int
    is_stable: bool
    is_yanked: bool
    yanked_reason: Optional[str] = None
    publish_status: str
    changelog: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ServiceOut(BaseModel):
    id: str
    developer_id: str
    name: str
    slug: str
    description: Optional[str] = None
    entry_class: Optional[str] = None
    homepage: Optional[str] = None
    repository: Optional[str] = None
    is_published: bool
    avg_rating: float
    rating_count: int
    install_count: int
    categories: List[CategoryOut] = []
    versions: List[ServiceVersionOut] = []
    latest_version: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_latest(cls, obj: object) -> "ServiceOut":
        data = cls.model_validate(obj)
        versions = getattr(obj, "versions", [])
        non_yanked = [v for v in versions if not getattr(v, "is_yanked", False)]
        if non_yanked:
            data.latest_version = getattr(non_yanked[0], "version", None)
        return data


class ServiceSummary(BaseModel):
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    entry_class: Optional[str] = None
    is_published: bool
    avg_rating: float
    rating_count: int
    install_count: int
    categories: List[CategoryOut] = []
    latest_version: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_latest(cls, obj: object) -> "ServiceSummary":
        data = cls.model_validate(obj)
        versions = getattr(obj, "versions", [])
        non_yanked = [v for v in versions if not getattr(v, "is_yanked", False)]
        if non_yanked:
            data.latest_version = getattr(non_yanked[0], "version", None)
        return data


class ServiceUpdate(BaseModel):
    description: Optional[str] = None
    homepage: Optional[str] = None
    repository: Optional[str] = None


class RatingCreate(BaseModel):
    score: int = Field(..., ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=1000)


class RatingOut(BaseModel):
    id: str
    service_id: str
    user_id: str
    score: int
    comment: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}
