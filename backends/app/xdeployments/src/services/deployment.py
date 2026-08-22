from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.deployment import STATUSES, Deployment


class DeploymentService:
    def __init__(self, session: AsyncSession):
        self._s = session

    async def report(
        self,
        *,
        deployer_id: str,
        kind: str,
        slug: str,
        version: str,
        status: str,
        started_at: datetime,
        completed_at: datetime,
        host_id: str = "default",
        repo: Optional[str] = None,
        error_message: Optional[str] = None,
    ) -> Deployment:
        if kind not in ("plugin", "service"):
            raise ValueError(f"kind invalide : '{kind}' (attendu : plugin ou service)")
        if status not in STATUSES:
            raise ValueError(
                f"status invalide : '{status}' (attendu : {', '.join(STATUSES)})"
            )

        deployment = Deployment(
            deployer_id=deployer_id,
            kind=kind,
            slug=slug,
            version=version,
            host_id=host_id,
            status=status,
            repo=repo,
            error_message=error_message,
            started_at=started_at,
            completed_at=completed_at,
        )
        self._s.add(deployment)
        await self._s.flush()
        return deployment

    async def list_for_deployer(
        self,
        deployer_id: str,
        *,
        slug: Optional[str] = None,
        host_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Deployment]:
        q = (
            select(Deployment)
            .where(Deployment.deployer_id == deployer_id)
            .order_by(Deployment.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        if slug:
            q = q.where(Deployment.slug == slug)
        if host_id:
            q = q.where(Deployment.host_id == host_id)
        if status:
            q = q.where(Deployment.status == status)
        return list((await self._s.execute(q)).scalars().all())

    async def latest_per_host(
        self, deployer_id: str, *, kind: str, slug: str
    ) -> List[Deployment]:
        """La ligne la plus récente pour chaque host_id — vue "flotte" de l'état courant."""
        result = await self._s.execute(
            select(Deployment)
            .where(
                Deployment.deployer_id == deployer_id,
                Deployment.kind == kind,
                Deployment.slug == slug,
            )
            .order_by(Deployment.host_id, Deployment.created_at.desc())
        )
        latest_by_host: dict[str, Deployment] = {}
        for row in result.scalars().all():
            if row.host_id not in latest_by_host:
                latest_by_host[row.host_id] = row
        return list(latest_by_host.values())

    async def purge_old(
        self, *, keep_per_bucket: int = 50, max_age_days: int = 90
    ) -> int:
        """Purge deux façons : (1) au-delà de `keep_per_bucket` lignes pour un même
        (deployer_id, kind, slug, host_id) — un agent qui redéploie souvent ne doit
        pas faire grossir la table indéfiniment ; (2) tout ce qui dépasse
        `max_age_days`, même en dessous du quota par bucket. Retourne le nombre de
        lignes supprimées."""
        deleted = 0

        cutoff = datetime.utcnow() - timedelta(days=max_age_days)
        result = await self._s.execute(
            delete(Deployment).where(Deployment.created_at < cutoff)
        )
        deleted += result.rowcount or 0

        bucket_cols = (
            Deployment.deployer_id,
            Deployment.kind,
            Deployment.slug,
            Deployment.host_id,
        )
        buckets = (await self._s.execute(select(*bucket_cols).distinct())).all()

        for deployer_id, kind, slug, host_id in buckets:
            count = await self._s.scalar(
                select(func.count())
                .select_from(Deployment)
                .where(
                    Deployment.deployer_id == deployer_id,
                    Deployment.kind == kind,
                    Deployment.slug == slug,
                    Deployment.host_id == host_id,
                )
            )
            if not count or count <= keep_per_bucket:
                continue

            excess = count - keep_per_bucket
            stale_ids_result = await self._s.execute(
                select(Deployment.id)
                .where(
                    Deployment.deployer_id == deployer_id,
                    Deployment.kind == kind,
                    Deployment.slug == slug,
                    Deployment.host_id == host_id,
                )
                .order_by(Deployment.created_at.asc())
                .limit(excess)
            )
            stale_ids = [row[0] for row in stale_ids_result.all()]
            if stale_ids:
                result = await self._s.execute(
                    delete(Deployment).where(Deployment.id.in_(stale_ids))
                )
                deleted += result.rowcount or 0

        await self._s.flush()
        return deleted
