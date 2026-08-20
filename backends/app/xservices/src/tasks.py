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

        svc_service = ServiceService(session)
        slug = service_name.lower().replace(" ", "-")
        existing_svc = await svc_service.get_by_slug(slug)
        # Une extension existante appartient à son premier soumissionnaire — un autre
        # développeur soumettant sous le même nom/slug ne doit ni la modifier ni lui
        # ajouter une version (usurpation via un slug déjà pris).
        ownership_conflict = (
            existing_svc is not None and existing_svc.developer_id != developer_id
        )
        if ownership_conflict:
            sub.status = "rejected"
            logger.warning(
                "[task] Soumission rejetée : %s (slug=%s) appartient à un autre "
                "développeur (submitted by=%s, owner=%s)",
                service_name, slug, developer_id, existing_svc.developer_id,
            )
        elif result.status != SubmissionStatus.REJECTED:
            svc = existing_svc

            _meta = _extract_service_yaml_meta(zip_path)

            # Fallback : si la source est github et que service.yaml n'a pas de
            # repository, on utilise le repo GitHub de la soumission (même logique
            # que app/marketplace/src/tasks.py pour les plugins).
            if (
                sub.source == "github"
                and sub.github_repo
                and not _meta.get("repository")
            ):
                _meta["repository"] = f"https://github.com/{sub.github_repo}"

            if svc is None:
                svc = await svc_service.create(
                    developer_id=developer_id,
                    name=service_name,
                    description=_meta.get("description"),
                    entry_class=_meta.get("entry_class"),
                    homepage=_meta.get("homepage"),
                    repository=_meta.get("repository"),
                    visibility=sub.visibility or "public",
                    tenant_id=sub.tenant_id,
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

            # Docs (README / integration / contributor) : récupérées en direct depuis
            # le repo GitHub au tag publié — uniquement pour les soumissions "github"
            # (un ZIP brut soumis sans repo lié n'a pas de doc).
            if sub.source == "github" and sub.github_repo and sub.github_branch:
                try:
                    from app.marketplace.src.services.github import GitHubService as _GHService
                    from .services.doc_extractor import ServiceDocExtractorService

                    owner, _, repo_name_gh = sub.github_repo.partition("/")
                    fetched = await _GHService(session).fetch_docs(
                        user_id=developer_id,
                        repo_owner=owner,
                        repo_name=repo_name_gh,
                        ref=sub.github_branch,  # tag Git validé à la soumission
                    )
                    await ServiceDocExtractorService(session).save_docs(
                        service_id=svc.id,
                        version=service_version,
                        readme=fetched.get("readme"),
                        integration=fetched.get("integration"),
                        contributor=fetched.get("contributor"),
                    )
                except Exception as exc:
                    logger.warning(
                        "[xservices] Récupération docs échouée pour %s v%s : %s",
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
        from app.xpulse.src.client import RedisConfiguration, RedisPubSubManager

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
