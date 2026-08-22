from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.doc import ServiceDoc

logger = logging.getLogger("hub.xservices.doc_extractor")


def _parse_contributor(raw: Optional[str]) -> Optional[Dict[str, Any]]:
    if raw is None:
        return None
    try:
        import yaml

        parsed = yaml.safe_load(raw)
        if isinstance(parsed, dict):
            return parsed
        return {"data": parsed} if parsed is not None else {"raw": raw}
    except Exception:
        try:
            return json.loads(raw)
        except Exception:
            return {"raw": raw}


class ServiceDocExtractorService:
    """
    Persiste la documentation d'une version d'extension de service.

    Les contenus (readme / integration / contributor) sont récupérés en amont
    directement depuis le repo GitHub du service, au tag publié — voir
    GitHubService.fetch_docs (app marketplace) — et non plus extraits du ZIP soumis.
    """

    def __init__(self, session: AsyncSession):
        self._s = session

    async def save_docs(
        self,
        service_id: str,
        version: str,
        readme: Optional[str],
        integration: Optional[str],
        contributor: Optional[str],
    ) -> ServiceDoc:
        parsed_contributor = _parse_contributor(contributor)

        existing = await self._s.scalar(
            select(ServiceDoc)
            .where(ServiceDoc.service_id == service_id, ServiceDoc.version == version)
        )

        if existing:
            existing.readme = readme
            existing.integration = integration
            existing.contributor = parsed_contributor
            existing.extracted_at = datetime.utcnow()
            await self._s.flush()
            return existing

        doc = ServiceDoc(
            service_id=service_id,
            version=version,
            readme=readme,
            integration=integration,
            contributor=parsed_contributor,
        )
        self._s.add(doc)
        await self._s.flush()

        logger.info(
            "[xservices] Docs enregistrés pour service=%s v%s — readme=%s integration=%s contributor=%s",
            service_id, version,
            readme is not None, integration is not None, contributor is not None,
        )
        return doc

    async def get(self, service_id: str, version: str) -> Optional[ServiceDoc]:
        return await self._s.scalar(
            select(ServiceDoc)
            .where(ServiceDoc.service_id == service_id, ServiceDoc.version == version)
        )

    async def get_latest(self, service_id: str) -> Optional[ServiceDoc]:
        return await self._s.scalar(
            select(ServiceDoc)
            .where(ServiceDoc.service_id == service_id)
            .order_by(ServiceDoc.extracted_at.desc())
            .limit(1)
        )
