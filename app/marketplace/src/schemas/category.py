from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = None


class CategoryOut(BaseModel):
    id: str
    name: str
    slug: str
    description: Optional[str]
    plugin_count: Optional[int] = None

    model_config = {"from_attributes": True}
