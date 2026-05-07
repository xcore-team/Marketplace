from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SubmitGitHubRequest(BaseModel):
    repo_owner: str
    repo_name: str
    branch: str = "main"
    plugin_version: str


class SubmissionOut(BaseModel):
    id: str
    developer_id: str
    plugin_name: str
    plugin_version: str
    status: str
    anomaly_score: int
    source: str
    github_repo: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}
