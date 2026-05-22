"""Tâches Celery xservices — pipeline de validation des extensions de service."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

from xcore.sdk import task

logger = logging.getLogger("hub.xservices.tasks")


def _extract_service_yaml_meta(zip_path: Path) -> dict:
    """Extrait name/description/entry_class/homepage/repository de service.yaml dans le ZIP."""
    import zipfile

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            names = zf.namelist()
            candidates = [
                n for n in names if n == "service.yaml" or n.endswith("/service.yaml")
            ]
            if not candidates:
                # Fallback sur plugin.yaml si service.yaml absent
                candidates = [
                    n for n in names if n == "plugin.yaml" or n.endswith("/plugin.yaml")
                ]
            if not candidates:
                return {}
            target = min(candidates, key=lambda x: x.count("/"))
            import yaml

            data = (
                yaml.safe_load(zf.read(target).decode("utf-8", errors="replace")) or {}
            )
            return {
                "description": data.get("description") or None,
                "entry_class": data.get("entry_class") or data.get("module") or None,
                "homepage": data.get("homepage") or data.get("home_url") or None,
                "repository": data.get("repository") or data.get("repo") or None,
            }
    except Exception as exc:
        logger.warning("[task] Impossible d'extraire service.yaml meta : %s", exc)
        return {}


@task(
    name="xservices.process_submission", queue="submissions", max_retries=2, bind=True
)
def process_submission(
    self,
    submission_id: str,
    developer_id: str,
    zip_path: str,
    service_name: str,
    service_version: str,
    secret_key: str = "",
    db_url: str = "",
) -> dict:
    import asyncio

    return asyncio.run(
        _run_pipeline(
            submission_id=submission_id,
            developer_id=developer_id,
            zip_path=Path(zip_path),
            service_name=service_name,
            service_version=service_version,
            secret_key=secret_key.encode()
            if isinstance(secret_key, str)
            else secret_key,
            db_url=db_url,
        )
    )


async def _publish_email(redis_url: str, payload: dict) -> None:
    try:
        import redis.asyncio as _aioredis

        _r = _aioredis.from_url(redis_url, decode_responses=True)
        await _r.publish("marketplace.email", json.dumps(payload))
        await _r.aclose()
    except Exception as exc:
        logger.warning("[task] Publish email event échoué : %s", exc)


async def _run_pipeline(
    submission_id: str,
    developer_id: str,
    zip_path: Path,
    service_name: str,
    service_version: str,
    secret_key: bytes,
    db_url: str,
) -> dict:
    import os

    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from pipelines.models import SubmissionStatus
    from sandbox import SandboxedServicePipeline, SandboxLimits

    from .models.service import ServiceSubmission
    from .services.service import ServiceService

    effective_db_url = os.environ.get("DATABASE_URL") or db_url
    engine = create_async_engine(effective_db_url, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)
    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

    # ── Phase 1 : avant pipeline ──────────────────────────────────────────────
    async with async_session() as session:
        sub = await session.get(ServiceSubmission, submission_id)
        if sub is None:
            logger.error("Soumission introuvable : %s", submission_id)
            return {"error": "not_found"}

        category_ids: list[str] = []
        if sub.category_ids:
            try:
                category_ids = json.loads(sub.category_ids)
            except Exception:
                pass

        try:
            from app.xauth.src.models.user import User

            dev_user = await session.get(User, developer_id)
            developer_email = dev_user.email if dev_user else None
            developer_name = (
                developer_email.split("@")[0] if developer_email else developer_id
            )
        except Exception as exc:
            logger.warning(
                "[task] Impossible de récupérer l'email du développeur : %s", exc
            )
            developer_email = None
            developer_name = developer_id

        sub.status = "processing"
        await session.commit()

    if developer_email:
        await _publish_email(
            redis_url,
            {
                "action": "submission_received",
                "to": developer_email,
                "developer_name": developer_name,
                "plugin_name": service_name,
                "plugin_version": service_version,
                "submission_id": submission_id,
                "source": "service_upload",
            },
        )

    # ── Phase 2 : pipeline (réutilise SandboxedPipeline) ─────────────────────
    limits = SandboxLimits(memory_mb=128, cpu_seconds=10, timeout=30)

    async with async_session() as session:
        sub = await session.get(ServiceSubmission, submission_id)
        if sub is None:
            return {"error": "not_found"}

        try:
            result = await SandboxedServicePipeline(
                zip_path=zip_path,
                developer_id=developer_id,
                secret_key=secret_key,
                limits=limits,
            ).run(
                submission_id=submission_id,
                service_name=service_name,
                service_version=service_version,
            )
        except Exception:
            sub.status = "failed"
            sub.completed_at = datetime.utcnow()
            await session.commit()
            logger.exception("Pipeline échoué pour %s", submission_id)
            if developer_email:
                await _publish_email(
                    redis_url,
                    {
                        "action": "pipeline_failed",
                        "to": developer_email,
                        "developer_name": developer_name,
                        "plugin_name": service_name,
                        "plugin_version": service_version,
                        "submission_id": submission_id,
                    },
                )
            raise

        sub.status = result.status.value
        sub.anomaly_score = result.anomaly_score
        sub.report_json = json.dumps(result.to_dict(), ensure_ascii=False)
        sub.completed_at = datetime.utcnow()
        await session.flush()

        if result.status != SubmissionStatus.REJECTED:
            svc_service = ServiceService(session)
            slug = service_name.lower().replace(" ", "-")
            svc = await svc_service.get_by_slug(slug)

            _meta = _extract_service_yaml_meta(zip_path)

            if svc is None:
                svc = await svc_service.create(
                    developer_id=developer_id,
                    name=service_name,
                    description=_meta.get("description"),
                    entry_class=_meta.get("entry_class"),
                    homepage=_meta.get("homepage"),
                    repository=_meta.get("repository"),
                )
            else:
                if not svc.description and _meta.get("description"):
                    svc.description = _meta["description"]
                if not svc.homepage and _meta.get("homepage"):
                    svc.homepage = _meta["homepage"]
                if not svc.repository and _meta.get("repository"):
                    svc.repository = _meta["repository"]
                await session.flush()

            await svc_service.add_version(
                service=svc,
                version=service_version,
                anomaly_score=result.anomaly_score,
                merkle_root=result.merkle_root,
                is_stable=(result.status == SubmissionStatus.APPROVED),
                entry_class=_meta.get("entry_class"),
            )

            if category_ids:
                try:
                    await svc_service.assign_categories(svc, category_ids)
                except Exception as exc:
                    logger.warning("[task] Assignation catégories échouée : %s", exc)

            # Extraction docs (README, integration, contributor) depuis le ZIP
            try:
                from .services.doc_extractor import ServiceDocExtractorService

                await ServiceDocExtractorService(session).extract_and_save(
                    service_id=svc.id,
                    version=service_version,
                    zip_path=zip_path,
                )
            except Exception as exc:
                logger.warning(
                    "[xservices] Extraction docs échouée pour %s v%s : %s",
                    service_name,
                    service_version,
                    exc,
                )

        await session.commit()

    try:
        zip_path.unlink(missing_ok=True)
    except Exception as exc:
        logger.warning("[task] Impossible de supprimer le ZIP temporaire : %s", exc)

    # ── Phase 3 : notifications ───────────────────────────────────────────────
    if developer_email:
        _action_map = {
            "approved": "pipeline_approved",
            "rejected": "pipeline_rejected",
            "manual_review": "pipeline_manual_review",
            "failed": "pipeline_failed",
        }
        await _publish_email(
            redis_url,
            {
                "action": _action_map.get(sub.status, "pipeline_failed"),
                "to": developer_email,
                "developer_name": developer_name,
                "plugin_name": service_name,
                "plugin_version": service_version,
                "submission_id": submission_id,
                "anomaly_score": result.anomaly_score,
            },
        )

    # SSE via xpulse
    try:
        from app.XPulse.src.client import RedisConfiguration, RedisPubSubManager

        _redis = RedisPubSubManager(
            RedisConfiguration(url=redis_url, channel=["notification"])
        )
        await _redis.connect()
        _payload = {
            "event": "SERVICE_SUBMISSION_DONE",
            "submission_id": submission_id,
            "service_name": service_name,
            "service_version": service_version,
            "status": sub.status,
            "anomaly_score": result.anomaly_score,
        }
        await _redis.publish("notification", {"user_id": developer_id, **_payload})
        await _redis.publish("admin", _payload)
        if sub.status == "approved":
            await _redis.publish(
                "broadcast",
                {
                    "event": "SERVICE_PUBLISHED",
                    "service_name": service_name,
                    "service_version": service_version,
                },
            )
        await _redis.close()
    except Exception as exc:
        logger.warning("Publish Redis (xpulse) échoué : %s", exc)

    logger.info(
        "Pipeline service terminé %s → %s (score=%s)",
        submission_id,
        sub.status,
        result.anomaly_score,
    )
    return {
        "submission_id": submission_id,
        "status": sub.status,
        "anomaly_score": result.anomaly_score,
    }
