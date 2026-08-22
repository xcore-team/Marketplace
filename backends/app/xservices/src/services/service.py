from __future__ import annotations

import re
from typing import List, Optional

from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.service import Service, ServiceCategory, ServiceVersion, service_category_table


def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    return re.sub(r"-+", "-", slug)


class ServiceService:
    def __init__(self, session: AsyncSession):
        self._s = session

    async def create(
        self,
        developer_id: str,
        name: str,
        description: Optional[str] = None,
        entry_class: Optional[str] = None,
        homepage: Optional[str] = None,
        repository: Optional[str] = None,
        visibility: str = "public",
        tenant_id: Optional[str] = None,
    ) -> Service:
        if visibility not in ("public", "private"):
            raise ValueError(f"visibility invalide : '{visibility}' (attendu : public ou private)")
        slug = _slugify(name)
        existing = await self._s.scalar(select(Service).where(Service.slug == slug))
        if existing:
            raise ValueError(f"Une extension avec le slug '{slug}' existe déjà.")
        svc = Service(
            developer_id=developer_id,
            name=name,
            slug=slug,
            description=description,
            entry_class=entry_class,
            homepage=homepage,
            repository=repository,
            visibility=visibility,
            tenant_id=tenant_id,
        )
        self._s.add(svc)
        await self._s.flush()
        return svc

    async def get(self, service_id: str) -> Optional[Service]:
        return await self._s.scalar(
            select(Service)
            .where(Service.id == service_id)
            .options(selectinload(Service.versions), selectinload(Service.categories))
        )

    async def get_by_slug(self, slug: str) -> Optional[Service]:
        return await self._s.scalar(
            select(Service)
            .where(Service.slug == slug)
            .options(selectinload(Service.versions), selectinload(Service.categories))
        )

    @staticmethod
    def _visibility_clause(viewer_id: Optional[str], viewer_tenant_ids: Optional[set]):
        clause = Service.visibility == "public"
        if viewer_id:
            clause = clause | (Service.developer_id == viewer_id)
        if viewer_tenant_ids:
            clause = clause | (Service.tenant_id.in_(viewer_tenant_ids))
        return clause

    async def list_published(
        self,
        limit: int = 50,
        offset: int = 0,
        search: Optional[str] = None,
        category_id: Optional[str] = None,
        sort: Optional[str] = "newest",
        viewer_id: Optional[str] = None,
        viewer_tenant_ids: Optional[set] = None,
    ) -> List[Service]:
        _sort_col = {
            "installs": Service.install_count.desc(),
            "rating": Service.avg_rating.desc(),
        }.get(sort or "newest", Service.updated_at.desc())
        q = (
            select(Service)
            .where(Service.is_published == True)  # noqa: E712
            .where(self._visibility_clause(viewer_id, viewer_tenant_ids))
            .options(selectinload(Service.versions), selectinload(Service.categories))
            .order_by(_sort_col)
            .limit(limit)
            .offset(offset)
        )
        if search:
            q = q.where(
                Service.name.ilike(f"%{search}%")
                | Service.description.ilike(f"%{search}%")
            )
        if category_id:
            q = q.where(
                Service.id.in_(
                    select(service_category_table.c.service_id).where(
                        service_category_table.c.category_id == category_id
                    )
                )
            )
        return list((await self._s.execute(q)).scalars().all())

    async def count_published(
        self,
        search: Optional[str] = None,
        category_id: Optional[str] = None,
        viewer_id: Optional[str] = None,
        viewer_tenant_ids: Optional[set] = None,
    ) -> int:
        from sqlalchemy import func

        q = (
            select(func.count())
            .select_from(Service)
            .where(Service.is_published == True)  # noqa: E712
            .where(self._visibility_clause(viewer_id, viewer_tenant_ids))
        )
        if search:
            q = q.where(
                Service.name.ilike(f"%{search}%")
                | Service.description.ilike(f"%{search}%")
            )
        if category_id:
            q = q.where(
                Service.id.in_(
                    select(service_category_table.c.service_id).where(
                        service_category_table.c.category_id == category_id
                    )
                )
            )
        return (await self._s.scalar(q)) or 0

    async def can_view(
        self,
        service: Service,
        viewer_id: Optional[str],
        viewer_tenant_ids: Optional[set] = None,
    ) -> bool:
        if service.visibility != "private":
            return True
        if viewer_id and viewer_id == service.developer_id:
            return True
        if service.tenant_id and viewer_tenant_ids and service.tenant_id in viewer_tenant_ids:
            return True
        return False

    async def list_by_developer(self, developer_id: str) -> List[Service]:
        result = await self._s.execute(
            select(Service)
            .where(Service.developer_id == developer_id)
            .options(selectinload(Service.versions), selectinload(Service.categories))
            .order_by(Service.updated_at.desc())
        )
        return list(result.scalars().all())

    SCORE_AUTO_PUBLISH = 20

    async def add_version(
        self,
        service: Service,
        version: str,
        anomaly_score: int = 0,
        merkle_root: Optional[str] = None,
        is_stable: bool = False,
        changelog: Optional[str] = None,
        entry_class: Optional[str] = None,
    ) -> ServiceVersion:
        from pipelines.models import SCORE_AUTO_REJECT

        # Même correctif que PluginService.add_version (app/marketplace) —
        # un (service_id, version) déjà publié avec le même merkle_root est
        # un no-op légitime (CI recompute rejoué) ; un merkle_root différent
        # sous le même numéro de version est un vrai conflit à refuser
        # explicitement plutôt qu'à republier silencieusement l'ancien
        # contenu ou crasher sur la contrainte UNIQUE(service_id, version).
        existing = await self._s.scalar(
            select(ServiceVersion)
            .where(ServiceVersion.service_id == service.id)
            .where(ServiceVersion.version == version)
        )
        if existing is not None:
            if existing.merkle_root == merkle_root:
                return existing
            raise ValueError(
                f"La version {version} de « {service.name} » est déjà publiée avec un "
                "contenu différent (merkle root différent). Incrémentez le numéro de "
                "version dans service.yaml pour publier ces changements."
            )

        if anomaly_score >= SCORE_AUTO_REJECT:
            publish_status = "rejected"
        elif anomaly_score <= self.SCORE_AUTO_PUBLISH:
            publish_status = "auto_published"
        else:
            publish_status = "manual_review"

        sv = ServiceVersion(
            service_id=service.id,
            version=version,
            anomaly_score=anomaly_score,
            merkle_root=merkle_root,
            is_stable=is_stable,
            changelog=changelog,
            publish_status=publish_status,
        )
        self._s.add(sv)

        if publish_status in ("auto_published", "manual_review"):
            service.is_published = True
            if entry_class:
                service.entry_class = entry_class
        elif publish_status == "rejected":
            service.is_published = False

        await self._s.flush()
        return sv

    async def assign_categories(self, service: Service, category_ids: List[str]) -> None:
        """Remplace les catégories d'un service par la liste fournie.

        Utilise du SQL direct sur la table d'association pour éviter tout
        lazy-loading de la collection ORM (interdit en async SQLAlchemy).
        """
        # Supprimer toutes les associations existantes
        await self._s.execute(
            delete(service_category_table).where(
                service_category_table.c.service_id == service.id
            )
        )
        if category_ids:
            # Vérifier que les IDs existent bien dans xsvc_categories
            result = await self._s.execute(
                select(ServiceCategory.id).where(ServiceCategory.id.in_(category_ids))
            )
            valid_ids = [row[0] for row in result.all()]
            if valid_ids:
                await self._s.execute(
                    insert(service_category_table).values([
                        {"service_id": service.id, "category_id": cid}
                        for cid in valid_ids
                    ])
                )
        await self._s.flush()
        # Invalider le cache ORM de la relation pour forcer un rechargement propre
        self._s.expire(service, ["categories"])

    async def yank_version(
        self,
        service_id: str,
        version: str,
        reason: Optional[str] = None,
    ) -> Optional[ServiceVersion]:
        sv = await self._s.scalar(
            select(ServiceVersion)
            .where(ServiceVersion.service_id == service_id, ServiceVersion.version == version)
        )
        if sv is None:
            return None
        sv.is_yanked = True
        sv.yanked_reason = reason
        sv.publish_status = "yanked"
        await self._s.flush()
        return sv
