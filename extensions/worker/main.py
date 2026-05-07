"""
Extension Worker Xcore — file de tâches Celery asynchrones.

Configuration dans integration.yaml :

    extensions:
      worker:
        module: extensions.worker.main:WorkerService
        config:
          broker_url: redis://localhost:6379/0
          result_backend: redis://localhost:6379/1
          concurrency: 8
          queues:
            - default
            - submissions

Lancer le worker :
    celery -A extensions.worker.app worker --loglevel=info -Q submissions,default

Envoyer une tâche depuis FastAPI :
    from extensions.worker.registry import task_registry
    task_registry["my_task"].delay(arg1, arg2)
"""

from __future__ import annotations

import logging
import os
from typing import Any

from xcore.services.base import BaseService, ServiceStatus

from .config import WorkerConfig
from .registry import build_app, register_pending_tasks, set_app

logger = logging.getLogger("xcore.worker")


def _make_app_from_env() -> Any:
    """Crée l'app Celery depuis les vars d'env — appelé à l'import pour le CLI."""
    try:
        from celery import Celery  # type: ignore[import]
        from kombu import Queue  # type: ignore[import]
    except ImportError:
        return None

    broker = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
    backend = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")
    queues_raw = os.getenv("CELERY_QUEUES", "default,submissions").split(",")

    _app = Celery("app")
    _app.conf.update(
        broker_url=broker,
        result_backend=backend,
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        task_soft_time_limit=300,
        task_time_limit=360,
        result_expires=86400,
        broker_connection_retry_on_startup=True,
        task_default_queue="default",
        task_queues=tuple(Queue(q) for q in queues_raw),
    )
    return _app


# ── App disponible dès l'import — `celery -A extensions.worker.app` ──────────
app = _make_app_from_env()

if app is not None:
    set_app(app)
    # Importe les modules de tâches AVANT register_pending_tasks
    # pour que les @task() soient dans _pending_tasks
    try:
        import app.marketplace.src.tasks as _  # noqa: F401
    except Exception:
        pass
    register_pending_tasks(app)


class WorkerService(BaseService):
    """
    Service Worker xcore — reconfigure Celery depuis integration.yaml
    et vérifie la connexion au broker au démarrage.
    """

    name = "worker"

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__()
        self._cfg = WorkerConfig.from_dict(config)

    async def init(self) -> None:
        global app

        self._status = ServiceStatus.INITIALIZING

        if app is None:
            logger.error("celery non installé — uv add 'celery[redis]'")
            self._status = ServiceStatus.FAILED
            return

        # Reconfigure depuis integration.yaml (écrase les vars d'env)
        app = build_app(self._cfg)
        set_app(app)
        register_pending_tasks(app)

        try:
            conn = app.connection_for_read()
            conn.ensure_connection(max_retries=3)
            conn.release()
            logger.info(
                "WorkerService prêt → broker=%s queues=%s concurrency=%d",
                self._cfg.broker_url,
                self._cfg.queues,
                self._cfg.concurrency,
            )
            self._status = ServiceStatus.READY
        except Exception as exc:
            logger.warning("Worker : broker inaccessible (%s) → mode dégradé", exc)
            self._status = ServiceStatus.DEGRADED

    async def shutdown(self) -> None:
        self._status = ServiceStatus.STOPPED
        logger.info("WorkerService arrêté")

    async def health_check(self) -> tuple[bool, str]:
        if app is None:
            return False, "app non initialisée"
        try:
            conn = app.connection_for_read()
            conn.ensure_connection(max_retries=1)
            conn.release()
            return True, f"broker {self._cfg.broker_url} accessible"
        except Exception as exc:
            return False, f"broker inaccessible : {exc}"

    def status(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "status": self._status.value,
            "broker_url": self._cfg.broker_url,
            "queues": self._cfg.queues,
            "concurrency": self._cfg.concurrency,
            "registered_tasks": list(app.tasks.keys()) if app else [],
        }

    def send(self, task_name: str, *args: Any, queue: str = "default", **kwargs: Any) -> Any:
        if app is None:
            raise RuntimeError("WorkerService non initialisé")
        return app.send_task(task_name, args=args, kwargs=kwargs, queue=queue)

    def get_result(self, task_id: str) -> Any:
        if app is None:
            raise RuntimeError("WorkerService non initialisé")
        return app.AsyncResult(task_id)
