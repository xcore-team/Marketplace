from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SubmissionOut(BaseModel):
    id: str
    developer_id: str
    service_name: str
    service_version: str
    status: str
    anomaly_score: int
    category_ids: Optional[str] = None
    source: Optional[str] = None
    github_repo: Optional[str] = None
    github_branch: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
