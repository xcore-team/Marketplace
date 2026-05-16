"""Tâches Celery du marketplace — exécutées dans un worker séparé."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

from xcore.sdk import task

logger = logging.getLogger("hub.marketplace.tasks")


@task(name="marketplace.process_submission", queue="submissions", max_retries=2, bind=True)
def process_submission(
    self,
    submission_id: str,
    developer_id: str,
    zip_path: str,
    plugin_name: str,
    plugin_version: str,
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
            secret_key=secret_key.encode() if isinstance(secret_key, str) else secret_key,
            db_url=db_url,
            sandbox_memory_mb=sandbox_memory_mb,
            sandbox_cpu_seconds=sandbox_cpu_seconds,
            sandbox_timeout=sandbox_timeout,
        )
    )


async def _load_category_ids_from_submission(session, submission_id: str) -> list[str]:
    from .models.submission import Submission
    sub = await session.get(Submission, submission_id)
    if sub and sub.category_ids:
        try:
            return json.loads(sub.category_ids)
        except Exception:
            pass
    return []


async def _run_pipeline(
    submission_id: str,
    developer_id: str,
    zip_path: Path,
    plugin_name: str,
    plugin_version: str,
    secret_key: bytes,
    db_url: str,
    sandbox_memory_mb: int,
    sandbox_cpu_seconds: int,
    sandbox_timeout: int,
) -> dict:
    import os

    from pipelines.models import SubmissionStatus
    from sandbox import SandboxedPipeline, SandboxLimits
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

    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

    async with async_session() as session:
        sub = await session.get(Submission, submission_id)
        if sub is None:
            logger.error("Soumission introuvable : %s", submission_id)
            return {"error": "not_found"}

        category_ids = await _load_category_ids_from_submission(session, submission_id)

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

            if category_ids:
                try:
                    from .services.category import CategoryService
                    await CategoryService(session).assign_categories(plugin, category_ids)
                except Exception as exc:
                    logger.warning("[task] Assignation catégories échouée : %s", exc)

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

    try:
        zip_path.unlink(missing_ok=True)
    except Exception as exc:
        logger.warning("[task] Impossible de supprimer le ZIP temporaire %s : %s", zip_path, exc)

    # ── SSE via xpulse Redis ──────────────────────────────────────────────────
    try:
        from app.xpulse.src.client import RedisConfiguration, RedisPubSubManager

        _redis = RedisPubSubManager(RedisConfiguration(url=redis_url, channel=["notification"]))
        await _redis.connect()

        _payload = {
            "event": "SUBMISSION_PIPELINE_DONE",
            "submission_id": submission_id,
            "plugin_name": plugin_name,
            "plugin_version": plugin_version,
            "status": sub.status,
            "anomaly_score": result.anomaly_score,
        }
        await _redis.publish("notification", {"user_id": developer_id, **_payload})
        await _redis.publish("admin", _payload)
        if sub.status == "approved":
            await _redis.publish("broadcast", {
                "event": "PLUGIN_PUBLISHED",
                "plugin_name": plugin_name,
                "plugin_version": plugin_version,
            })

        await _redis.close()
    except Exception as exc:
        logger.warning("Publish Redis (xpulse) échoué : %s", exc)

    # ── Webhooks développeur ──────────────────────────────────────────────────
    try:
        import hmac
        import hashlib
        from datetime import datetime as _dt
        import httpx as _httpx
        from sqlalchemy.ext.asyncio import create_async_engine as _eng, AsyncSession
        from sqlalchemy.orm import sessionmaker
        from sqlalchemy import select as _select

        from .models.webhook import DeveloperWebhook

        if db_url:
            _engine = _eng(db_url, echo=False)
            _Session = sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)
            async with _Session() as _session:
                _hooks = list((await _session.execute(
                    _select(DeveloperWebhook).where(
                        DeveloperWebhook.developer_id == developer_id,
                        DeveloperWebhook.is_active == True,  # noqa: E712
                    )
                )).scalars().all())
            await _engine.dispose()

            _payload_data = {
                "event": sub.status,
                "submission_id": submission_id,
                "plugin_name": plugin_name,
                "plugin_version": plugin_version,
                "anomaly_score": result.anomaly_score,
                "timestamp": _dt.utcnow().isoformat(),
            }
            _body = json.dumps(_payload_data).encode()

            async with _httpx.AsyncClient(timeout=10) as _client:
                for _wh in _hooks:
                    _ev = _wh.events
                    if _ev != "*" and sub.status not in [e.strip() for e in _ev.split(",")]:
                        continue
                    _headers = {"Content-Type": "application/json"}
                    if _wh.secret:
                        _sig = hmac.new(_wh.secret.encode(), _body, hashlib.sha256).hexdigest()
                        _headers["X-Webhook-Signature"] = f"sha256={_sig}"
                    try:
                        _resp = await _client.post(_wh.url, content=_body, headers=_headers)
                        _wh.last_status_code = _resp.status_code
                        _wh.last_error = None
                    except Exception as _we:
                        _wh.last_status_code = None
                        _wh.last_error = str(_we)
                    _wh.last_triggered_at = _dt.utcnow()

            if _hooks:
                from sqlalchemy import update as _update
                _engine2 = _eng(db_url, echo=False)
                _Session2 = sessionmaker(_engine2, class_=AsyncSession, expire_on_commit=False)
                async with _Session2() as _s2:
                    for _wh in _hooks:
                        await _s2.execute(
                            _update(DeveloperWebhook)
                            .where(DeveloperWebhook.id == _wh.id)
                            .values(
                                last_triggered_at=_wh.last_triggered_at,
                                last_status_code=_wh.last_status_code,
                                last_error=_wh.last_error,
                            )
                        )
                    await _s2.commit()
                await _engine2.dispose()
    except Exception as exc:
        logger.warning("Envoi webhooks échoué : %s", exc)

    logger.info("Pipeline terminé %s → %s (score=%s)", submission_id, sub.status, result.anomaly_score)
    return {"submission_id": submission_id, "status": sub.status, "anomaly_score": result.anomaly_score}
