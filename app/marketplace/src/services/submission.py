# submision with pipeline verification
from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from pipelines.models import SubmissionStatus
from sandbox import SandboxedPipeline, SandboxLimits

from ..models.submission import Submission
from ..notifications.pipeline import NotificationPipeline
from .plugin import PluginService

logger = logging.getLogger("hub.marketplace.submissions")



class SubmissionService:
    def __init__(
        self,
        session: AsyncSession,
        notifications: NotificationPipeline,
        developer_email: str,
        limits: SandboxLimits | None = None,
    ):
        self._s = session
        self._notif = notifications
        self._email = developer_email
        self._limits = limits or SandboxLimits()

    async def create_pending(
        self,
        developer_id: str,
        plugin_name: str,
        plugin_version: str,
        source: str = "upload",
        github_repo: Optional[str] = None,
    ) -> Submission:
        """Enregistre la soumission en DB avec status 'pending' — sans lancer le pipeline."""
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
        self._notif.on_received(self._email, plugin_name, sub.id)
        logger.info("[submission] %s — en attente de traitement par le worker", sub.id)
        return sub

    async def submit_zip(
        self,
        developer_id: str,
        zip_path: Path,
        plugin_name: str,
        plugin_version: str,
        secret_key: bytes = b"",
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

        self._notif.on_received(self._email, plugin_name, sub.id)
        logger.info(
            f"[submission] {sub.id} — pipeline pour {plugin_name} v{plugin_version}"
        )

        result = await SandboxedPipeline(
            zip_path=zip_path,
            developer_id=developer_id,
            secret_key=secret_key,
            limits=self._limits,
        ).run(
            submission_id=sub.id,
            plugin_name=plugin_name,
            plugin_version=plugin_version,
        )

        sub.status = result.status.value
        sub.anomaly_score = result.anomaly_score
        sub.report_json = json.dumps(result.to_dict(), ensure_ascii=False)
        sub.completed_at = datetime.utcnow()
        await self._s.flush()

        if result.status != SubmissionStatus.REJECTED:
            plugin_svc = PluginService(self._s)
            slug = plugin_name.lower().replace(" ", "-")
            plugin = await plugin_svc.get_by_slug(slug)
            if plugin is None:
                plugin = await plugin_svc.create(
                    developer_id=developer_id, name=plugin_name
                )
            await plugin_svc.add_version(
                plugin=plugin,
                version=plugin_version,
                anomaly_score=result.anomaly_score,
                merkle_root=result.merkle_root,
                is_stable=(result.status == SubmissionStatus.APPROVED),
            )

        if result.status == SubmissionStatus.APPROVED:
            self._notif.on_approved(self._email, plugin_name, plugin_version, sub.id)
        elif result.status == SubmissionStatus.REJECTED:
            self._notif.on_rejected(
                self._email, plugin_name, plugin_version, result.anomaly_score, sub.id
            )
        elif result.status == SubmissionStatus.MANUAL_REVIEW:
            self._notif.on_manual_review(
                self._email, plugin_name, plugin_version, result.anomaly_score, sub.id
            )

        logger.info(f"[submission] {sub.id} → {sub.status} (score={sub.anomaly_score})")
        return sub
