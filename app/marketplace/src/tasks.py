"""
Tâches Celery du marketplace — exécutées dans un worker séparé.

Lancer le worker :
    celery -A extensions.celery.main.celery_app worker \
        --loglevel=info -Q submissions,default -c 8
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

from extensions.worker.registry import task

logger = logging.getLogger("hub.marketplace.tasks")


@task(name="marketplace.process_submission", queue="submissions", max_retries=2, bind=True)
def process_submission(
    self,  # bind=True — self est l'instance de la tâche Celery (pour retry)
    submission_id: str,
    developer_id: str,
    zip_path: str,
    plugin_name: str,
    plugin_version: str,
    developer_email: str,
    secret_key: str = "",
    db_url: str = "",
    sandbox_memory_mb: int = 128,
    sandbox_cpu_seconds: int = 10,
    sandbox_timeout: int = 30,
) -> dict:
    """
    Pipeline complet de validation d'un plugin — s'exécute dans le worker Celery.

    Les workers Celery sont synchrones par design (pas d'asyncio ici).
    On utilise asyncio.run() pour exécuter le code async du pipeline.
    """
    import asyncio

    return asyncio.run(
        _run_pipeline(
            submission_id=submission_id,
            developer_id=developer_id,
            zip_path=Path(zip_path),
            plugin_name=plugin_name,
            plugin_version=plugin_version,
            developer_email=developer_email,
            secret_key=secret_key.encode() if isinstance(secret_key, str) else secret_key,
            db_url=db_url,
            sandbox_memory_mb=sandbox_memory_mb,
            sandbox_cpu_seconds=sandbox_cpu_seconds,
            sandbox_timeout=sandbox_timeout,
        )
    )


async def _run_pipeline(
    submission_id: str,
    developer_id: str,
    zip_path: Path,
    plugin_name: str,
    plugin_version: str,
    developer_email: str,
    secret_key: bytes,
    db_url: str,
    sandbox_memory_mb: int,
    sandbox_cpu_seconds: int,
    sandbox_timeout: int,
) -> dict:
    from pipelines.models import SubmissionStatus
    from sandbox import SandboxedPipeline, SandboxLimits
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from .models.submission import Submission
    from .notifications.pipeline import NotificationPipeline
    from .services.plugin import PluginService

    engine = create_async_engine(db_url, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    limits = SandboxLimits(
        memory_mb=sandbox_memory_mb,
        cpu_seconds=sandbox_cpu_seconds,
        timeout=sandbox_timeout,
    )

    async with async_session() as session:
        # Marque la soumission comme "processing"
        sub = await session.get(Submission, submission_id)
        if sub is None:
            logger.error("Soumission introuvable : %s", submission_id)
            return {"error": "not_found"}

        sub.status = "processing"
        await session.flush()

        try:
            result = await SandboxedPipeline(
                zip_path=zip_path,
                developer_id=developer_id,
                secret_key=secret_key,
                limits=limits,
            ).run(
                submission_id=submission_id,
                plugin_name=plugin_name,
                plugin_version=plugin_version,
            )
        except Exception as exc:
            sub.status = "failed"
            sub.completed_at = datetime.utcnow()
            await session.commit()
            logger.exception("Pipeline échoué pour %s", submission_id)
            raise

        sub.status = result.status.value
        sub.anomaly_score = result.anomaly_score
        sub.report_json = json.dumps(result.to_dict(), ensure_ascii=False)
        sub.completed_at = datetime.utcnow()
        await session.flush()

        notif = NotificationPipeline(email_service=None, app_name="xcore-market")

        # Récupère l'email admin depuis la DB
        from sqlalchemy import text as sql_text
        admin_row = await session.execute(
            sql_text("SELECT email FROM xauth_users WHERE email LIKE '%admin%' LIMIT 1")
        )
        admin_email_row = admin_row.fetchone()
        admin_email = admin_email_row[0] if admin_email_row else None

        if result.status != SubmissionStatus.REJECTED:
            plugin_svc = PluginService(session)
            slug = plugin_name.lower().replace(" ", "-")
            plugin = await plugin_svc.get_by_slug(slug)
            if plugin is None:
                plugin = await plugin_svc.create(developer_id=developer_id, name=plugin_name)
            await plugin_svc.add_version(
                plugin=plugin,
                version=plugin_version,
                anomaly_score=result.anomaly_score,
                merkle_root=result.merkle_root,
                verified_zip_path=result.verified_zip_path,
                is_stable=(result.status == SubmissionStatus.APPROVED),
                notifications=notif,
                admin_email=admin_email,
            )

        await session.commit()

        # Notification au développeur
        if result.status == SubmissionStatus.APPROVED:
            notif.on_approved(developer_email, plugin_name, plugin_version, submission_id)
        elif result.status == SubmissionStatus.REJECTED:
            notif.on_rejected(developer_email, plugin_name, plugin_version, result.anomaly_score, submission_id)
        elif result.status == SubmissionStatus.MANUAL_REVIEW:
            notif.on_manual_review(developer_email, plugin_name, plugin_version, result.anomaly_score, submission_id)

        logger.info("Pipeline terminé %s → %s (score=%s)", submission_id, sub.status, sub.anomaly_score)
        return {"submission_id": submission_id, "status": sub.status, "anomaly_score": sub.anomaly_score}
