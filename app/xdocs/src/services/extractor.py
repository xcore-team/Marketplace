from __future__ import annotations

import json
import logging
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.doc import PluginDoc

logger = logging.getLogger("hub.xdocs.extractor")

# Noms de fichiers acceptés pour chaque slot (ordre de priorité)
_CANDIDATES: dict[str, list[str]] = {
    "readme": ["README.md", "readme.md", "Readme.md"],
    "integration": ["integration.md", "INTEGRATION.md", "integration.yaml", "integration.yml"],
    "contributor": ["contributor.yaml", "contributors.yaml", "CONTRIBUTOR.yaml", "CONTRIBUTORS.yaml", "contributor.yml"],
}


def _parse_contributor(raw: Optional[str]) -> Optional[Dict[str, Any]]:
    """Parse le contenu YAML du fichier contributor en dict JSON-serialisable."""
    if raw is None:
        return None
    try:
        import yaml
        parsed = yaml.safe_load(raw)
        if isinstance(parsed, dict):
            return parsed
        # Si le YAML produit une liste ou un scalaire, on l'enveloppe
        return {"data": parsed}
    except Exception:
        # Fallback : tente JSON direct
        try:
            return json.loads(raw)
        except Exception as exc:
            logger.warning("Impossible de parser contributor.yaml : %s", exc)
            return {"raw": raw}


def _read_from_zip(zip_path: Path, candidates: list[str]) -> Optional[str]:
    """Lit le premier fichier trouvé parmi les candidats dans le ZIP."""
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            names = zf.namelist()
            for candidate in candidates:
                # Cherche le fichier à la racine ou dans un sous-dossier de premier niveau
                matches = [n for n in names if n == candidate or n.endswith(f"/{candidate}")]
                if matches:
                    # Prend le chemin le plus court (le plus proche de la racine)
                    target = min(matches, key=lambda x: x.count("/"))
                    content = zf.read(target).decode("utf-8", errors="replace")
                    logger.debug("Extrait %s depuis %s", candidate, zip_path.name)
                    return content
    except Exception as exc:
        logger.warning("Erreur lecture ZIP %s : %s", zip_path, exc)
    return None


class DocExtractorService:
    def __init__(self, session: AsyncSession):
        self._s = session

    async def extract_and_save(
        self,
        plugin_id: str,
        version: str,
        zip_path: Path,
    ) -> PluginDoc:
        """Extrait les 3 fichiers du ZIP et persiste en DB (upsert par plugin_id + version)."""
        readme = _read_from_zip(zip_path, _CANDIDATES["readme"])
        integration = _read_from_zip(zip_path, _CANDIDATES["integration"])
        contributor = _parse_contributor(_read_from_zip(zip_path, _CANDIDATES["contributor"]))

        existing = await self._s.scalar(
            select(PluginDoc)
            .where(PluginDoc.plugin_id == plugin_id)
            .where(PluginDoc.version == version)
        )

        if existing:
            existing.readme = readme
            existing.integration = integration
            existing.contributor = contributor
            existing.extracted_at = datetime.utcnow()
            await self._s.flush()
            return existing

        doc = PluginDoc(
            plugin_id=plugin_id,
            version=version,
            readme=readme,
            integration=integration,
            contributor=contributor,
        )
        self._s.add(doc)
        await self._s.flush()

        logger.info(
            "[xdocs] Docs extraits pour plugin=%s v%s — readme=%s integration=%s contributor=%s",
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
