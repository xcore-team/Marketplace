from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, model_validator  # model_validator utilisé par SubmitGitHubRequest


class SubmitGitHubRequest(BaseModel):
    full_name: str                         # "owner/repo" — issu de GET /github/repos
    default_branch: str = "main"           # branche par défaut retournée par /github/repos
    plugin_version: str
    category_ids: list[str] = []

    @model_validator(mode="after")
    def resolve_repo(self) -> "SubmitGitHubRequest":
        parts = self.full_name.split("/", 1)
        if len(parts) != 2 or not all(parts):
            raise ValueError("full_name doit être au format 'owner/repo'")
        return self

    @property
    def repo_owner(self) -> str:
        return self.full_name.split("/")[0]

    @property
    def repo_name(self) -> str:
        return self.full_name.split("/")[1]

    @property
    def branch(self) -> str:
        return self.default_branch


class SubmissionOut(BaseModel):
    id: str
    developer_id: str
    plugin_name: str
    plugin_version: str
    status: str
    anomaly_score: int
    source: str
    github_repo: Optional[str]
    category_ids: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}
