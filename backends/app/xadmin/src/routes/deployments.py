from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text as sql_text
from xcore.kernel.api import AuthPayload
from xcore.sdk import require_permission

from ..schemas.admin import DeploymentAdminOut, PageOut, PurgeResult


def deployments_router(db: Any, ctx: Any) -> APIRouter:
    router = APIRouter(prefix="/deployments", tags=["admin:deployments"])

    @router.get("", response_model=PageOut[DeploymentAdminOut])
    async def list_deployments(
        deployer_id: Optional[str] = Query(None),
        kind: Optional[str] = Query(None, description="plugin | service"),
        slug: Optional[str] = Query(None),
        status_filter: Optional[str] = Query(
            None, alias="status", description="success | failed | rolled_back"
        ),
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        current_user: AuthPayload = Depends(require_permission("admin:*")),
    ) -> Any:
        """Tous les rapports de déploiement rapportés par xcore-agent, tous
        opérateurs confondus — visibilité plateforme sur ce qui tourne où."""
        async with db.session() as session:
            params = {
                "deployer_id": deployer_id,
                "kind": kind,
                "slug": slug,
                "status": status_filter,
                "limit": limit,
                "offset": offset,
            }
            where = """
                WHERE (:deployer_id IS NULL OR d.deployer_id = :deployer_id)
                  AND (:kind IS NULL OR d.kind = :kind)
                  AND (:slug IS NULL OR d.slug = :slug)
                  AND (:status IS NULL OR d.status = :status)
            """
            total_row = await session.execute(
                sql_text(f"SELECT COUNT(*) AS n FROM xdep_deployments d {where}"),
                params,
            )
            total = total_row.fetchone().n

            rows = await session.execute(
                sql_text(f"""
                    SELECT
                        d.id, d.deployer_id, u.email AS deployer_email,
                        d.kind, d.slug, d.version, d.host_id, d.status,
                        d.repo, d.error_message, d.started_at, d.completed_at, d.created_at
                    FROM xdep_deployments d
                    LEFT JOIN xauth_users u ON u.id = d.deployer_id
                    {where}
                    ORDER BY d.created_at DESC
                    LIMIT :limit OFFSET :offset
                """),
                params,
            )
            items = [
                DeploymentAdminOut(
                    id=r.id,
                    deployer_id=r.deployer_id,
                    deployer_email=r.deployer_email,
                    kind=r.kind,
                    slug=r.slug,
                    version=r.version,
                    host_id=r.host_id,
                    status=r.status,
                    repo=r.repo,
                    error_message=r.error_message,
                    started_at=r.started_at,
                    completed_at=r.completed_at,
                    created_at=r.created_at,
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

    @router.post("/purge", response_model=PurgeResult)
    async def purge_deployments(
        keep_per_bucket: int = Query(50, ge=1, le=1000),
        max_age_days: int = Query(90, ge=1),
        current_user: AuthPayload = Depends(require_permission("admin:*")),
    ) -> Any:
        """Purge manuelle des rapports de déploiement — voir
        DeploymentService.purge_old (pas de tâche planifiée existante dans ce
        repo à laquelle s'accrocher automatiquement, donc déclenchement admin).

        Appelé via IPC (xdeployments expose deployments.purge), pas un import
        direct de DeploymentService comme avant — xadmin n'a aucune raison de
        connaître le module de services internes d'un autre plugin."""
        response = await ctx(
            "xdeployments",
            "deployments.purge",
            {"keep_per_bucket": keep_per_bucket, "max_age_days": max_age_days},
        )
        if response.get("status") != "ok":
            raise HTTPException(
                status_code=500, detail=response.get("msg", "Purge échouée")
            )
        return PurgeResult(deleted=response["deleted"])

    return router
