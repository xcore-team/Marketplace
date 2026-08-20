from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text as sql_text
from xcore.kernel.api import AuthPayload
from xcore.sdk import require_permission

from ..schemas.admin import PageOut, SubmissionAdminOut


def submissions_router(db: Any, events: Any = None) -> APIRouter:
    router = APIRouter(prefix="/submissions", tags=["admin:submissions"])

    @router.get("", response_model=PageOut[SubmissionAdminOut])
    async def list_submissions(
        status_filter: Optional[str] = Query(None, alias="status"),
        source: Optional[str] = Query(None, description="upload | github | ci"),
        search: Optional[str] = Query(None, description="Recherche par nom de plugin"),
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        current_user: AuthPayload = Depends(require_permission("submissions:review")),
    ) -> Any:
        async with db.session() as session:
            params = {
                "status": status_filter,
                "source": source,
                "search": search,
                "pattern": f"%{search}%" if search else None,
                "limit": limit,
                "offset": offset,
            }
            total_row = await session.execute(
                sql_text("""
                    SELECT COUNT(*) AS n FROM market_submissions s
                    WHERE (:status IS NULL OR s.status = :status)
                      AND (:source IS NULL OR s.source = :source)
                      AND (:search IS NULL OR s.plugin_name LIKE :pattern)
                """),
                params,
            )
            total = total_row.fetchone().n

            rows = await session.execute(
                sql_text("""
                    SELECT
                        s.id, s.developer_id, u.email AS developer_email,
                        s.plugin_name, s.plugin_version, s.status,
                        s.source, s.anomaly_score, s.created_at, s.completed_at
                    FROM market_submissions s
                    LEFT JOIN xauth_users u ON u.id = s.developer_id
                    WHERE (:status IS NULL OR s.status = :status)
                      AND (:source IS NULL OR s.source = :source)
                      AND (:search IS NULL OR s.plugin_name LIKE :pattern)
                    ORDER BY s.created_at DESC
                    LIMIT :limit OFFSET :offset
                """),
                params,
            )
            items = [
                SubmissionAdminOut(
                    id=r.id,
                    developer_id=r.developer_id,
                    developer_email=r.developer_email,
                    plugin_name=r.plugin_name,
                    plugin_version=r.plugin_version,
                    status=r.status,
                    source=r.source,
                    anomaly_score=r.anomaly_score,
                    created_at=r.created_at,
                    completed_at=r.completed_at,
                )
                for r in rows.fetchall()
            ]
            return PageOut(
                items=items,
                total=total,
                limit=limit,
                offset=offset,
                has_more=offset + limit < total,
            )

    @router.get("/{submission_id}/report")
    async def get_submission_report(
        submission_id: str,
        current_user: AuthPayload = Depends(require_permission("submissions:review")),
    ) -> Any:
        import json

        async with db.session() as session:
            row = await session.execute(
                sql_text("SELECT report_json FROM market_submissions WHERE id = :id"),
                {"id": submission_id},
            )
            sub = row.fetchone()
            if sub is None:
                raise HTTPException(status_code=404, detail="Soumission introuvable")
            if sub.report_json is None:
                raise HTTPException(status_code=404, detail="Rapport non disponible")
            return json.loads(sub.report_json)

    @router.patch("/{submission_id}/status")
    async def set_status(
        submission_id: str,
        new_status: str = Query(
            ..., description="approved | rejected | manual_review | pending"
        ),
        current_user: AuthPayload = Depends(require_permission("submissions:review")),
    ) -> Any:
        allowed = {"approved", "rejected", "manual_review", "pending"}
        if new_status not in allowed:
            raise HTTPException(
                status_code=400, detail=f"Statut invalide. Valeurs: {allowed}"
            )

        async with db.session() as session:
            sub_row = await session.execute(
                sql_text(
                    "SELECT id, developer_id, plugin_name, plugin_version FROM market_submissions WHERE id = :id"
                ),
                {"id": submission_id},
            )
            sub = sub_row.fetchone()
            if sub is None:
                raise HTTPException(status_code=404, detail="Soumission introuvable")

            await session.execute(
                sql_text(
                    "UPDATE market_submissions SET status = :status WHERE id = :id"
                ),
                {"status": new_status, "id": submission_id},
            )

            slug = sub.plugin_name.lower().replace(" ", "-")
            if new_status in ("approved", "manual_review"):
                await session.execute(
                    sql_text(
                        "UPDATE market_plugins SET is_published = :pub WHERE slug = :slug"
                    ),
                    {"pub": True, "slug": slug},
                )
            elif new_status == "rejected":
                await session.execute(
                    sql_text(
                        "UPDATE market_plugins SET is_published = :pub WHERE slug = :slug"
                    ),
                    {"pub": False, "slug": slug},
                )

            await session.commit()

        if events:
            try:
                await events.emit(
                    "ext.notification.publish",
                    {
                        "channel": "notification",
                        "user_id": sub.developer_id,
                        "event": "SUBMISSION_STATUS_CHANGED",
                        "submission_id": submission_id,
                        "plugin_name": sub.plugin_name,
                        "plugin_version": sub.plugin_version,
                        "status": new_status,
                    },
                )
            except Exception:
                pass

        return {"submission_id": submission_id, "status": new_status}

    return router
