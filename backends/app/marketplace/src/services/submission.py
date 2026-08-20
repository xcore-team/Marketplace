from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from ..models.submission import Submission

logger = logging.getLogger("hub.marketplace.submissions")


class SubmissionService:
    def __init__(self, session: AsyncSession):
        self._s = session

    async def create_pending(
        self,
        developer_id: str,
        plugin_name: str,
        plugin_version: str,
        source: str = "upload",
        github_repo: Optional[str] = None,
    ) -> Submission:
        sub = Submission(
            developer_id=developer_id,
            plugin_name=plugin_name,
            plugin_version=plugin_version,
            status="pending",
            source=source,
            github_repo=github_repo,
        )
        self._s.add(sub)
        await self._s.flush()
        return sub
