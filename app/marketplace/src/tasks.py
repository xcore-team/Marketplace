"""
Tâches Celery du marketplace — exécutées dans un worker séparé.

Lancer le worker :
    celery -A extensions.xworker.app worker \
        --loglevel=info -Q submissions,default -c 8

Architecture :
    process_submission  → pipeline pur (sandbox + signing + DB)
                        → dispatche notify_result à la fin
    notify_result       → email + xpulse Redis (toutes les notifs regroupées)
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

from extensions.xworker.registry import task

logger = logging.getLogger("hub.marketplace.tasks")


# ─────────────────────────────────────────────────────────────────────────────
# Tâche 1 — Pipeline pur (aucune notification)
# ─────────────────────────────────────────────────────────────────────────────

@task(name="marketplace.process_submission", queue="submissions", max_retries=2, bind=True)
def process_submission(
    self,
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
    from sqlalchemy import text as sql_text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from .models.submission import Submission
    from .services.plugin import PluginService

    engine = create_async_engine(db_url, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    limits = SandboxLimits(
        memory_mb=sandbox_memory_mb,
        cpu_seconds=sandbox_cpu_seconds,
        timeout=sandbox_timeout,
    )

    async with async_session() as session:
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
        except Exception:
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

        # Récupère l'email d'un utilisateur avec le rôle 'admin'
        admin_row = await session.execute(
            sql_text("""
                SELECT u.email FROM xauth_users u
                JOIN xauth_tenant_members tm ON tm.user_id = u.id
                JOIN xauth_roles r ON r.id = tm.role_id
                WHERE r.name = 'admin' AND u.is_active = 1
                LIMIT 1
            """)
        )
        admin_email_row = admin_row.fetchone()
        admin_email = admin_email_row[0] if admin_email_row else None

        # Crée/met à jour le plugin si non rejeté
        publish_status = None
        if result.status != SubmissionStatus.REJECTED:
            plugin_svc = PluginService(session)
            slug = plugin_name.lower().replace(" ", "-")
            plugin = await plugin_svc.get_by_slug(slug)
            if plugin is None:
                plugin = await plugin_svc.create(developer_id=developer_id, name=plugin_name)
            pv = await plugin_svc.add_version(
                plugin=plugin,
                version=plugin_version,
                anomaly_score=result.anomaly_score,
                merkle_root=result.merkle_root,
                is_stable=(result.status == SubmissionStatus.APPROVED),
            )
            publish_status = pv.publish_status

            # Extraction des docs embarquées (README.md, integration.md, contributor.yaml)
            # Doit se faire avant la suppression du ZIP temporaire
            try:
                from app.xdocs.src.services.extractor import DocExtractorService
                await DocExtractorService(session).extract_and_save(
                    plugin_id=plugin.id,
                    version=plugin_version,
                    zip_path=zip_path,
                )
            except Exception as exc:
                logger.warning("[xdocs] Extraction échouée pour %s v%s : %s", plugin_name, plugin_version, exc)

        await session.commit()

    # Suppression du ZIP temporaire — le fichier n'est plus nécessaire après traitement
    try:
        zip_path.unlink(missing_ok=True)
        logger.info("[task] ZIP temporaire supprimé : %s", zip_path)
    except Exception as exc:
        logger.warning("[task] Impossible de supprimer le ZIP temporaire %s : %s", zip_path, exc)

    # Dispatche la tâche de notification — séparée et isolée
    try:
        from extensions.xworker.registry import task_registry
        task_registry["marketplace.notify_result"].apply_async(
            kwargs=dict(
                submission_id=submission_id,
                status=sub.status,
                publish_status=publish_status,
                developer_id=developer_id,
                developer_email=developer_email,
                admin_email=admin_email,
                plugin_name=plugin_name,
                plugin_version=plugin_version,
                anomaly_score=result.anomaly_score,
            ),
            queue="default",
        )
    except Exception as exc:
        logger.warning("Impossible de dispatcher notify_result : %s", exc)

    logger.info("Pipeline terminé %s → %s (score=%s)", submission_id, sub.status, sub.anomaly_score)
    return {"submission_id": submission_id, "status": sub.status, "anomaly_score": sub.anomaly_score}


# ─────────────────────────────────────────────────────────────────────────────
# Tâche 2 — Notifications (email + SSE via Redis)
# ─────────────────────────────────────────────────────────────────────────────

@task(name="marketplace.notify_result", queue="default", max_retries=1)
def notify_result(
    submission_id: str,
    status: str,
    publish_status: str | None,
    developer_id: str,
    developer_email: str,
    admin_email: str | None,
    plugin_name: str,
    plugin_version: str,
    anomaly_score: int,
) -> None:
    import asyncio
    asyncio.run(
        _send_notifications(
            submission_id=submission_id,
            status=status,
            publish_status=publish_status,
            developer_id=developer_id,
            developer_email=developer_email,
            admin_email=admin_email,
            plugin_name=plugin_name,
            plugin_version=plugin_version,
            anomaly_score=anomaly_score,
        )
    )


async def _send_notifications(
    submission_id: str,
    status: str,
    publish_status: str | None,
    developer_id: str,
    developer_email: str,
    admin_email: str | None,
    plugin_name: str,
    plugin_version: str,
    anomaly_score: int,
) -> None:
    import os

    from .notifications.pipeline import NotificationPipeline, _build_email_service

    app_name = os.environ.get("APP_NAME", "xcore-market")
    email_svc = await _build_email_service()
    notif = NotificationPipeline(email_service=email_svc, app_name=app_name)

    # ── Emails ────────────────────────────────────────────────────────────────
    if status == "approved":
        notif.on_approved(developer_email, plugin_name, plugin_version, submission_id)
    elif status == "rejected":
        notif.on_rejected(developer_email, plugin_name, plugin_version, anomaly_score, submission_id)
    elif status == "manual_review":
        notif.on_manual_review(developer_email, plugin_name, plugin_version, anomaly_score, submission_id)

    if admin_email:
        if publish_status == "auto_published":
            notif.on_auto_published(admin_email, plugin_name, plugin_version, anomaly_score)
        elif publish_status == "manual_review":
            notif.on_manual_review_admin(admin_email, plugin_name, plugin_version, anomaly_score)

    # ── SSE via xpulse Redis ──────────────────────────────────────────────────
    try:
        from app.xpulse.src.client import RedisConfiguration, RedisPubSubManager

        _redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
        _redis = RedisPubSubManager(RedisConfiguration(url=_redis_url, channel=["notification"]))
        await _redis.connect()

        _payload = {
            "event": "SUBMISSION_PIPELINE_DONE",
            "submission_id": submission_id,
            "plugin_name": plugin_name,
            "plugin_version": plugin_version,
            "status": status,
            "anomaly_score": anomaly_score,
        }
        await _redis.publish("notification", {"user_id": developer_id, **_payload})
        if admin_email:
            await _redis.publish("admin", {"user_id": "admin", **_payload})
        if status == "approved":
            await _redis.publish("broadcast", {
                "event": "PLUGIN_PUBLISHED",
                "plugin_name": plugin_name,
                "plugin_version": plugin_version,
            })

        await _redis.close()
    except Exception as exc:
        logger.warning("Publish Redis (xpulse) échoué : %s", exc)
