from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, model_validator  # model_validator utilisé par SubmitGitHubRequest


class SubmitGitHubRequest(BaseModel):
    full_name: str                         # "owner/repo" — issu de GET /github/repos
    tag: str                               # tag Git publié — issu de GET /github/repos/{owner}/{repo}/tags
    plugin_version: str
    category_ids: list[str] = []
    visibility: str = "public"             # "public" | "private" — même sémantique que xservices

    @model_validator(mode="after")
    def resolve_repo(self) -> "SubmitGitHubRequest":
        parts = self.full_name.split("/", 1)
        if len(parts) != 2 or not all(parts):
            raise ValueError("full_name doit être au format 'owner/repo'")
        if not self.tag.strip():
            raise ValueError("tag ne peut pas être vide — le déploiement est forcé sur un tag Git")
        if self.visibility not in ("public", "private"):
            raise ValueError("visibility doit être 'public' ou 'private'")
        return self

    @property
    def repo_owner(self) -> str:
        return self.full_name.split("/")[0]

    @property
    def repo_name(self) -> str:
        return self.full_name.split("/")[1]


class SubmissionOut(BaseModel):
    id: str
    developer_id: str
    plugin_name: str
    plugin_version: str
    status: str
    anomaly_score: int
    source: str
    github_repo: Optional[str]
    github_branch: Optional[str] = None
    category_ids: Optional[str] = None
    visibility: str = "public"
    created_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}
