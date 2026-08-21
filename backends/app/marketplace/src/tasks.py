"""Tâches Celery du marketplace — exécutées dans un worker séparé."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path

from xcore.sdk import task

logger = logging.getLogger("hub.marketplace.tasks")


def _extract_plugin_yaml_meta(zip_path: Path) -> dict:
    """Extrait name/description/homepage/repository de plugin.yaml dans le ZIP."""
    import zipfile

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            names = zf.namelist()
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
                "homepage": data.get("homepage") or data.get("home_url") or None,
                "repository": data.get("repository") or data.get("repo") or None,
            }
    except Exception as exc:
        logger.warning("[task] Impossible d'extraire plugin.yaml meta : %s", exc)
        return {}


@task(
    name="marketplace.process_submission", queue="submissions", max_retries=2, bind=True
)
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
            secret_key=secret_key.encode()
            if isinstance(secret_key, str)
            else secret_key,
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


async def _publish_email(redis_url: str, payload: dict) -> None:
    """Publie un event email sur le channel Redis consommé par xmailproxy."""
    try:
        import redis.asyncio as _aioredis

        _r = _aioredis.from_url(redis_url, decode_responses=True)
        await _r.publish("marketplace.email", json.dumps(payload))
        await _r.aclose()
        logger.debug(
            "[task] Email event → marketplace.email (action=%s)", payload.get("action")
        )
    except Exception as exc:
        logger.warning("[task] Publish email event échoué : %s", exc)


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

    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from pipelines.models import SubmissionStatus
    from sandbox import SandboxedPipeline, SandboxLimits

    from .models.submission import Submission
    from .services.github import GitHubService
    from .services.plugin import PluginService

    effective_db_url = os.environ.get("DATABASE_URL") or db_url
    engine = create_async_engine(effective_db_url, echo=False)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    limits = SandboxLimits(
        memory_mb=sandbox_memory_mb,
        cpu_seconds=sandbox_cpu_seconds,
        timeout=sandbox_timeout,
    )

    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

    # ── Phase 1 : avant vérification ─────────────────────────────────────────
    async with async_session() as session:
        sub = await session.get(Submission, submission_id)
        if sub is None:
            logger.error("Soumission introuvable : %s", submission_id)
            return {"error": "not_found"}

        category_ids = await _load_category_ids_from_submission(session, submission_id)

        # Fetch developer info maintenant — utilisé avant et après le pipeline
        try:
            from app.auth.src.models.user import User

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
        await session.flush()
        await session.commit()

    # Email "soumission reçue" + "admin: nouvelle soumission" → avant le pipeline
    if developer_email:
        source = "upload"
        try:
            async with async_session() as _s:
                _sub = await _s.get(Submission, submission_id)
                if _sub:
                    source = _sub.source or "upload"
        except Exception:
            pass

        await _publish_email(
            redis_url,
            {
                "action": "submission_received",
                "to": developer_email,
                "developer_name": developer_name,
                "plugin_name": plugin_name,
                "plugin_version": plugin_version,
                "submission_id": submission_id,
                "source": source,
            },
        )
        await _publish_email(
            redis_url,
            {
                "action": "admin_new_submission",
                "to": developer_email,
                "developer_name": developer_name,
                "plugin_name": plugin_name,
                "plugin_version": plugin_version,
                "submission_id": submission_id,
                "source": source,
            },
        )

    # ── Phase 2 : vérification (pipeline) ────────────────────────────────────
    async with async_session() as session:
        sub = await session.get(Submission, submission_id)
        if sub is None:
            logger.error("Soumission introuvable en phase 2 : %s", submission_id)
            return {"error": "not_found"}

        # Le try couvre désormais AUSSI la phase de finalisation (create/
        # add_version/catégories/docs), pas seulement l'exécution du pipeline
        # — une erreur après un pipeline réussi (ex: IntegrityError sur un
        # (plugin_id, version) déjà publié, rejoué via /github/.../recompute)
        # laissait auparavant la Submission bloquée à "processing" pour
        # toujours : l'exception traversait tout _run_pipeline sans jamais
        # passer par le seul bloc qui marque status="failed".
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

            sub.status = result.status.value
            sub.anomaly_score = result.anomaly_score
            sub.report_json = json.dumps(result.to_dict(), ensure_ascii=False)
            sub.completed_at = datetime.utcnow()
            await session.flush()

            publish_status = None
            plugin_svc = PluginService(session)
            slug = plugin_name.lower().replace(" ", "-")
            existing_plugin = await plugin_svc.get_by_slug(slug)
            # Un plugin existant appartient à son premier soumissionnaire — un autre
            # développeur soumettant sous le même nom/slug ne doit ni le modifier ni
            # lui ajouter une version (usurpation via un slug déjà pris).
            ownership_conflict = (
                existing_plugin is not None and existing_plugin.developer_id != developer_id
            )
            if ownership_conflict:
                sub.status = "rejected"
                logger.warning(
                    "[task] Soumission rejetée : %s (slug=%s) appartient à un autre "
                    "développeur (submitted by=%s, owner=%s)",
                    plugin_name, slug, developer_id, existing_plugin.developer_id,
                )
            elif result.status != SubmissionStatus.REJECTED:
                plugin = existing_plugin

                # Extract metadata from plugin.yaml inside the ZIP
                _meta = _extract_plugin_yaml_meta(zip_path)

                # Fallback: si la source est github et que plugin.yaml n'a pas de repository,
                # on utilise le repo GitHub de la soumission
                if (
                    sub.source == "github"
                    and sub.github_repo
                    and not _meta.get("repository")
                ):
                    _meta["repository"] = f"https://github.com/{sub.github_repo}"

                if plugin is None:
                    plugin = await plugin_svc.create(
                        developer_id=developer_id,
                        name=plugin_name,
                        description=_meta.get("description"),
                        homepage=_meta.get("homepage"),
                        repository=_meta.get("repository"),
                        category_ids=category_ids if category_ids else None,
                        visibility=sub.visibility or "public",
                    )
                else:
                    # Update mutable fields if they were empty
                    if not plugin.description and _meta.get("description"):
                        plugin.description = _meta["description"]
                    if not plugin.homepage and _meta.get("homepage"):
                        plugin.homepage = _meta["homepage"]
                    if not plugin.repository and _meta.get("repository"):
                        plugin.repository = _meta["repository"]
                    await session.flush()

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

                        await CategoryService(session).assign_categories(
                            plugin, category_ids
                        )
                    except Exception as exc:
                        logger.warning("[task] Assignation catégories échouée : %s", exc)

                # Docs (README / integration / contributor) : récupérées en direct depuis
                # le repo GitHub au tag publié — uniquement pour les soumissions "github"
                # (une soumission ZIP brute n'a pas de repo/tag à interroger).
                if sub.source == "github" and sub.github_repo and sub.github_branch:
                    try:
                        from app.xdocs.src.services.extractor import DocExtractorService

                        owner, _, repo_name_gh = sub.github_repo.partition("/")
                        fetched = await GitHubService(session).fetch_docs(
                            user_id=developer_id,
                            repo_owner=owner,
                            repo_name=repo_name_gh,
                            ref=sub.github_branch,  # tag Git validé à la soumission
                        )
                        await DocExtractorService(session).save_docs(
                            plugin_id=plugin.id,
                            version=plugin_version,
                            readme=fetched.get("readme"),
                            integration=fetched.get("integration"),
                            contributor=fetched.get("contributor"),
                        )
                    except Exception as exc:
                        logger.warning(
                            "[xdocs] Récupération docs échouée pour %s v%s : %s",
                            plugin_name,
                            plugin_version,
                            exc,
                        )

            await session.commit()
        except Exception:
            # Rollback explicite : si l'erreur vient d'un flush()/commit() côté
            # DB (ex. IntegrityError d'add_version), la transaction en cours
            # est déjà invalide — sans ce rollback, le commit() ci-dessous
            # échouerait à son tour (PendingRollbackError) au lieu de marquer
            # la soumission "failed".
            await session.rollback()
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
                        "plugin_name": plugin_name,
                        "plugin_version": plugin_version,
                        "submission_id": submission_id,
                    },
                )
            raise

    try:
        zip_path.unlink(missing_ok=True)
    except Exception as exc:
        logger.warning(
            "[task] Impossible de supprimer le ZIP temporaire %s : %s", zip_path, exc
        )

    # ── Phase 3 : après vérification — email résultat pipeline ───────────────
    if developer_email:
        _status_to_action = {
            "approved": "pipeline_approved",
            "rejected": "pipeline_rejected",
            "manual_review": "pipeline_manual_review",
            "failed": "pipeline_failed",
        }
        _action = _status_to_action.get(sub.status, "pipeline_failed")

        _rejection_reason = ""
        if sub.status == "rejected" and sub.report_json is not None:
            try:
                _report = json.loads(sub.report_json)
                _rejection_reason = next(
                    (
                        g.get("reason", "")
                        for g in _report.get("gates", [])
                        if not g.get("passed")
                    ),
                    "",
                )
            except Exception:
                pass

        await _publish_email(
            redis_url,
            {
                "action": _action,
                "to": developer_email,
                "developer_name": developer_name,
                "plugin_name": plugin_name,
                "plugin_version": plugin_version,
                "submission_id": submission_id,
                "anomaly_score": result.anomaly_score,
                "rejection_reason": _rejection_reason,
            },
        )

    # ── SSE via xpulse Redis ──────────────────────────────────────────────────
    # `app.xpulse.src.client.RedisPubSubManager/RedisConfiguration` n'existent
    # plus nulle part dans le code (référence morte, probablement d'avant le
    # passage à extensions/pubsub) — cette publication échouait silencieusement
    # à CHAQUE pipeline (avalée par le except ci-dessous), donc le frontend ne
    # recevait jamais l'événement SSE déclenchant le refetch de "Mes soumissions"
    # (voir useXPulse.ts / SUBMISSION_PIPELINE_DONE dans App.tsx).
    try:
        from extensions.pubsub.service import PubSubClient

        _redis = PubSubClient({"provider": "redis", "redis": {"url": redis_url}})
        await _redis.init()

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
            await _redis.publish(
                "broadcast",
                {
                    "event": "PLUGIN_PUBLISHED",
                    "plugin_name": plugin_name,
                    "plugin_version": plugin_version,
                },
            )

        await _redis.shutdown()
    except Exception as exc:
        logger.warning("Publish Redis (xpulse) échoué : %s", exc)

    # ── Webhooks développeur ──────────────────────────────────────────────────
    try:
        import hashlib
        import hmac
        from datetime import datetime as _dt

        import httpx as _httpx
        from sqlalchemy import select as _select
        from sqlalchemy.ext.asyncio import AsyncSession
        from sqlalchemy.ext.asyncio import create_async_engine as _eng
        from sqlalchemy.orm import sessionmaker

        from .models.webhook import DeveloperWebhook

        _effective_db_url = os.environ.get("DATABASE_URL") or db_url
        if _effective_db_url:
            _engine = _eng(_effective_db_url, echo=False)
            _Session = sessionmaker(
                _engine, class_=AsyncSession, expire_on_commit=False
            )
            async with _Session() as _session:
                _hooks = list(
                    (
                        await _session.execute(
                            _select(DeveloperWebhook).where(
                                DeveloperWebhook.developer_id == developer_id,
                                DeveloperWebhook.is_active == True,  # noqa: E712
                            )
                        )
                    )
                    .scalars()
                    .all()
                )
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
                    if _ev != "*" and sub.status not in [
                        e.strip() for e in _ev.split(",")
                    ]:
                        continue
                    _headers = {"Content-Type": "application/json"}
                    if _wh.secret:
                        _sig = hmac.new(
                            _wh.secret.encode(), _body, hashlib.sha256
                        ).hexdigest()
                        _headers["X-Webhook-Signature"] = f"sha256={_sig}"
                    try:
                        _resp = await _client.post(
                            _wh.url, content=_body, headers=_headers
                        )
                        _wh.last_status_code = _resp.status_code
                        _wh.last_error = None
                    except Exception as _we:
                        _wh.last_status_code = None
                        _wh.last_error = str(_we)
                    _wh.last_triggered_at = _dt.utcnow()

            if _hooks:
                from sqlalchemy import update as _update

                _engine2 = _eng(_effective_db_url, echo=False)
                _Session2 = sessionmaker(
                    _engine2, class_=AsyncSession, expire_on_commit=False
                )
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

    logger.info(
        "Pipeline terminé %s → %s (score=%s)",
        submission_id,
        sub.status,
        result.anomaly_score,
    )
    return {
        "submission_id": submission_id,
        "status": sub.status,
        "anomaly_score": result.anomaly_score,
    }
