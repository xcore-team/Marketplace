from __future__ import annotations

import json
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text as sql_text
from xcore.kernel.api import AuthPayload
from xcore.sdk import require_permission

from ..schemas.admin import AuditLogOut


def audit_router(db: Any) -> APIRouter:
    router = APIRouter(prefix="/audit", tags=["admin:audit"])

    @router.get("", response_model=List[AuditLogOut])
    async def list_audit_logs(
        user_id: Optional[str] = Query(None),
        action: Optional[str] = Query(None),
        limit: int = Query(50, le=200),
        offset: int = 0,
        current_user: AuthPayload = Depends(require_permission("audit:read")),
    ) -> Any:
        """Liste les logs d'audit. Filtrable par utilisateur et action."""
        async with db.session() as session:
            rows = await session.execute(
                sql_text("""
                    SELECT id, user_id, action, resource, details, ip_address, created_at
                    FROM xauth_audit_logs
                    WHERE (:user_id IS NULL OR user_id = :user_id)
                      AND (:action IS NULL OR action = :action)
                    ORDER BY created_at DESC
                    LIMIT :limit OFFSET :offset
                """),
                {"user_id": user_id, "action": action, "limit": limit, "offset": offset},
            )
            logs = []
            for r in rows.fetchall():
                details = None
                if r.details:
                    try:
                        details = json.loads(r.details) if isinstance(r.details, str) else r.details
                    except Exception:
                        details = {"raw": r.details}
                logs.append(AuditLogOut(
                    id=r.id, user_id=r.user_id, action=r.action,
                    resource=r.resource, details=details,
                    ip_address=r.ip_address, created_at=r.created_at,
                ))
            return logs

    return router
