from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.doc import PluginDoc

logger = logging.getLogger("hub.xdocs.extractor")


def _parse_contributor(raw: Optional[str]) -> Optional[Dict[str, Any]]:
    """Parse le contenu YAML/Markdown du fichier contributor en dict JSON-serialisable."""
    if raw is None:
        return None
    try:
        import yaml

        parsed = yaml.safe_load(raw)
        if isinstance(parsed, dict):
            return parsed
        # Si le YAML produit une liste, un scalaire, ou n'est pas du YAML structuré
        # (ex: CONTRIBUTING.md est du Markdown), on l'enveloppe tel quel.
        return {"data": parsed} if parsed is not None else {"raw": raw}
    except Exception:
        try:
            return json.loads(raw)
        except Exception:
            return {"raw": raw}


class DocExtractorService:
    """
    Persiste la documentation d'une version de plugin.

    Les contenus (readme / integration / contributor) sont récupérés en amont
    directement depuis le repo GitHub du plugin, au tag publié — voir
    GitHubService.fetch_docs — et non plus extraits du ZIP soumis.
    """

    def __init__(self, session: AsyncSession):
        self._s = session

    async def save_docs(
        self,
        plugin_id: str,
        version: str,
        readme: Optional[str],
        integration: Optional[str],
        contributor: Optional[str],
    ) -> PluginDoc:
        """Upsert des docs d'une version (plugin_id + version) avec du contenu déjà récupéré."""
        parsed_contributor = _parse_contributor(contributor)

        existing = await self._s.scalar(
            select(PluginDoc)
            .where(PluginDoc.plugin_id == plugin_id)
            .where(PluginDoc.version == version)
        )

        if existing:
            existing.readme = readme
            existing.integration = integration
            existing.contributor = parsed_contributor
            existing.extracted_at = datetime.utcnow()
            await self._s.flush()
            return existing

        doc = PluginDoc(
            plugin_id=plugin_id,
            version=version,
            readme=readme,
            integration=integration,
            contributor=parsed_contributor,
        )
        self._s.add(doc)
        await self._s.flush()

        logger.info(
            "[xdocs] Docs enregistrés pour plugin=%s v%s — readme=%s integration=%s contributor=%s",
            plugin_id, version,
            readme is not None, integration is not None, contributor is not None,
        )
        return doc

    async def get(self, plugin_id: str, version: str) -> Optional[PluginDoc]:
        return await self._s.scalar(
            select(PluginDoc)
            .where(PluginDoc.plugin_id == plugin_id)
            .where(PluginDoc.version == version)
        )

    async def get_latest(self, plugin_id: str) -> Optional[PluginDoc]:
        """Retourne le doc de la version la plus récente (par extracted_at)."""
        return await self._s.scalar(
            select(PluginDoc)
            .where(PluginDoc.plugin_id == plugin_id)
            .order_by(PluginDoc.extracted_at.desc())
            .limit(1)
        )
