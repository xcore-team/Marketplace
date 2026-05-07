from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class RatingCreate(BaseModel):
    score: int = Field(..., ge=1, le=5, description="Note de 1 à 5")
    comment: Optional[str] = Field(None, max_length=1000)


class RatingOut(BaseModel):
    id: str
    plugin_id: str
    user_id: str
    score: int
    comment: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
