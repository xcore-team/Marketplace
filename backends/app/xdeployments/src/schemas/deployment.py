from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class DeploymentReportIn(BaseModel):
    kind: str  # "plugin" | "service"
    slug: str
    version: str
    status: str  # "success" | "failed" | "rolled_back"
    started_at: datetime
    completed_at: datetime
    host_id: str = "default"
    repo: Optional[str] = None
    error_message: Optional[str] = None

    @field_validator("kind")
    @classmethod
    def validate_kind(cls, v: str) -> str:
        if v not in ("plugin", "service"):
            raise ValueError("kind doit être 'plugin' ou 'service'")
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in ("success", "failed", "rolled_back"):
            raise ValueError("status doit être 'success', 'failed' ou 'rolled_back'")
        return v


class DeploymentOut(BaseModel):
    id: str
    deployer_id: str
    kind: str
    slug: str
    version: str
    host_id: str
    status: str
    repo: Optional[str] = None
    error_message: Optional[str] = None
    started_at: datetime
    completed_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}
