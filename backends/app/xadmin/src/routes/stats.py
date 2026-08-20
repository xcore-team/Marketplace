from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import text as sql_text
from xcore.kernel.api import AuthPayload
from xcore.sdk import require_permission

from ..schemas.admin import GlobalStatsOut, BroadcastRequest


def stats_router(db: Any, events: Any = None) -> APIRouter:
    router = APIRouter(tags=["admin:stats"])

    @router.get("/stats", response_model=GlobalStatsOut)
    async def global_stats(
        current_user: AuthPayload = Depends(require_permission("admin:*")),
    ) -> Any:
        """Stats globales de la plateforme : users, plugins, soumissions."""
        async with db.session() as session:
            row = await session.execute(
                sql_text("""
                    SELECT
                        (SELECT COUNT(*) FROM xauth_users) AS users_total,
                        (SELECT COUNT(*) FROM xauth_users WHERE is_active = :active) AS users_active,
                        (SELECT COUNT(*) FROM market_plugins) AS plugins_total,
                        (SELECT COUNT(*) FROM market_plugins WHERE is_published = :published) AS plugins_published,
                        (SELECT COUNT(*) FROM market_submissions) AS submissions_total,
                        (SELECT COUNT(*) FROM market_submissions WHERE status = 'pending') AS submissions_pending,
                        (SELECT COUNT(*) FROM market_submissions WHERE status = 'approved') AS submissions_approved,
                        (SELECT COUNT(*) FROM market_submissions WHERE status = 'rejected') AS submissions_rejected,
                        (SELECT COUNT(*) FROM market_submissions WHERE status = 'manual_review') AS submissions_manual_review,
                        (SELECT COUNT(*) FROM market_categories) AS categories_total
                """),
                {"active": True, "published": True},
            )
            r = row.fetchone()
            return GlobalStatsOut(
                users_total=r.users_total,
                users_active=r.users_active,
                plugins_total=r.plugins_total,
                plugins_published=r.plugins_published,
                submissions_total=r.submissions_total,
                submissions_pending=r.submissions_pending,
                submissions_approved=r.submissions_approved,
                submissions_rejected=r.submissions_rejected,
                submissions_manual_review=r.submissions_manual_review,
                categories_total=r.categories_total,
            )

    @router.post("/broadcast", status_code=204)
    async def broadcast_message(
        body: BroadcastRequest,
        current_user: AuthPayload = Depends(require_permission("admin:*")),
    ) -> None:
        """Envoie un message broadcast à tous les utilisateurs connectés via xpulse."""
        if events:
            await events.emit("ext.notification.broadcast", {
                "channels": ["broadcast"],
                "event": body.event,
                "text": body.message,
                "from": "admin",
            })

    return router
