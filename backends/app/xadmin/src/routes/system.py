from __future__ import annotations

import os
import platform
import sys
from typing import Any

from fastapi import APIRouter, Depends
from xcore.kernel.api import AuthPayload
from xcore.sdk import require_permission


def system_router(db: Any) -> APIRouter:
    router = APIRouter(prefix="/system", tags=["admin:system"])

    @router.get("/info")
    async def system_info(
        current_user: AuthPayload = Depends(require_permission("admin:*")),
    ) -> Any:
        """Informations système : Python, OS, variables d'env non sensibles."""
        return {
            "python": sys.version,
            "platform": platform.platform(),
            "pid": os.getpid(),
            "env": {
                "APP_NAME": os.environ.get("APP_NAME", "xcore-market"),
                "SANDBOX_MEMORY_MB": os.environ.get("SANDBOX_MEMORY_MB"),
                "SANDBOX_CPU_SECONDS": os.environ.get("SANDBOX_CPU_SECONDS"),
                "CELERY_BROKER_URL": _mask(os.environ.get("CELERY_BROKER_URL", "")),
                "DATABASE_URL": _mask(os.environ.get("DATABASE_URL", "")),
            },
        }

    @router.get("/db")
    async def db_stats(
        current_user: AuthPayload = Depends(require_permission("admin:*")),
    ) -> Any:
        """Taille de chaque table principale."""
        from sqlalchemy import text as sql_text
        tables = [
            "xauth_users", "xauth_sessions", "xauth_audit_logs",
            "market_plugins", "market_plugin_versions", "market_submissions",
            "market_plugin_docs", "market_categories",
        ]
        async with db.session() as session:
            counts = {}
            for table in tables:
                try:
                    row = await session.execute(sql_text(f"SELECT COUNT(*) AS n FROM {table}"))
                    counts[table] = row.fetchone().n
                except Exception:
                    counts[table] = None
            return counts

    return router


def _mask(url: str) -> str:
    """Cache le mot de passe dans une URL de connexion."""
    import re
    return re.sub(r"://([^:]+):([^@]+)@", r"://\1:***@", url)
