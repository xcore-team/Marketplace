from __future__ import annotations

import json
import logging
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.doc import ServiceDoc

logger = logging.getLogger("hub.xservices.doc_extractor")

_CANDIDATES: dict[str, list[str]] = {
    "readme": ["README.md", "readme.md", "Readme.md"],
    "integration": ["integration.md", "INTEGRATION.md", "Integration.md"],
    "contributor": ["contributor.yaml", "contributors.yaml", "CONTRIBUTOR.yaml", "CONTRIBUTORS.yaml", "contributor.yml"],
}


def _read_from_zip(zip_path: Path, candidates: list[str]) -> Optional[str]:
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            names = zf.namelist()
            for candidate in candidates:
                matches = [n for n in names if n == candidate or n.endswith(f"/{candidate}")]
                if matches:
                    target = min(matches, key=lambda x: x.count("/"))
                    return zf.read(target).decode("utf-8", errors="replace")
    except Exception as exc:
        logger.warning("Erreur lecture ZIP %s : %s", zip_path, exc)
    return None


def _parse_contributor(raw: Optional[str]) -> Optional[Dict[str, Any]]:
    if raw is None:
        return None
    try:
        import yaml
        parsed = yaml.safe_load(raw)
        return parsed if isinstance(parsed, dict) else {"data": parsed}
    except Exception:
        try:
            return json.loads(raw)
        except Exception:
            return {"raw": raw}


class ServiceDocExtractorService:
    def __init__(self, session: AsyncSession):
        self._s = session

    async def extract_and_save(
        self,
        service_id: str,
        version: str,
        zip_path: Path,
    ) -> ServiceDoc:
        readme = _read_from_zip(zip_path, _CANDIDATES["readme"])
        integration = _read_from_zip(zip_path, _CANDIDATES["integration"])
        contributor = _parse_contributor(_read_from_zip(zip_path, _CANDIDATES["contributor"]))

        existing = await self._s.scalar(
            select(ServiceDoc)
            .where(ServiceDoc.service_id == service_id, ServiceDoc.version == version)
        )

        if existing:
            existing.readme = readme
            existing.integration = integration
            existing.contributor = contributor
            existing.extracted_at = datetime.utcnow()
            await self._s.flush()
            return existing

        doc = ServiceDoc(
            service_id=service_id,
            version=version,
            readme=readme,
            integration=integration,
            contributor=contributor,
        )
        self._s.add(doc)
        await self._s.flush()

        logger.info(
            "[xservices] Docs extraits pour service=%s v%s — readme=%s integration=%s contributor=%s",
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
