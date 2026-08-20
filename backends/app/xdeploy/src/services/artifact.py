"""Stockage des artefacts `.xdeploy` scellés — sur disque, jamais en base
(un artefact peut faire plusieurs Mo ; le flux marketplace lui-même ne
persiste jamais de ZIP, il re-fetch GitHub à chaque install — voir
routes/install.py côté marketplace ; ici on ne peut pas re-générer un
artefact à l'identique à la demande puisqu'il est scellé sous un DEK propre
à ce build précis, donc il faut vraiment le garder quelque part une fois).

`app/<plugin>/data/` est déjà la convention pour du contenu possédé par un
plugin dans ce repo (voir app/marketplace/data/templates/) — on la
reprend ici pour les artefacts.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.artifact import XDeployArtifact

_ARTIFACTS_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "artifacts"


def _artifact_path(project_id: str, version: str) -> Path:
    # project_id est un identifiant opaque émis par le Hub (prj_<hex>),
    # jamais choisi par le client — pas de risque de traversal ici, mais on
    # reste défensif sur `version` (fourni par l'opérateur à la publication).
    safe_version = "".join(c for c in version if c.isalnum() or c in ".-_") or "unknown"
    return _ARTIFACTS_DIR / project_id / f"{safe_version}.xdeploy"


class ArtifactService:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def publish(
        self,
        *,
        project_id: str,
        project_name: str,
        version: str,
        publisher_id: str,
        ciphertext: bytes,
        content_sha256: str,
        dek_wrapped: str,
        signature_hex: str,
        signer_public_key_hex: str,
    ) -> XDeployArtifact:
        existing = await self.get(project_id, version)
        if existing is not None:
            raise ValueError(
                f"La version '{version}' du projet '{project_id}' est déjà publiée "
                "— chaque (projet, version) est immuable une fois publiée."
            )

        path = _artifact_path(project_id, version)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(ciphertext)

        record = XDeployArtifact(
            project_id=project_id,
            project_name=project_name,
            version=version,
            file_path=str(path.relative_to(_ARTIFACTS_DIR.parent.parent)),
            size_bytes=len(ciphertext),
            content_sha256=content_sha256,
            dek_wrapped=dek_wrapped,
            signature=signature_hex,
            signer_public_key=signer_public_key_hex,
            publisher_id=publisher_id,
        )
        self._s.add(record)
        await self._s.flush()
        return record

    async def get(self, project_id: str, version: str) -> Optional[XDeployArtifact]:
        return await self._s.scalar(
            select(XDeployArtifact).where(
                XDeployArtifact.project_id == project_id, XDeployArtifact.version == version
            )
        )

    async def get_by_id(self, artifact_id: str) -> Optional[XDeployArtifact]:
        return await self._s.get(XDeployArtifact, artifact_id)

    async def latest(self, project_id: str) -> Optional[XDeployArtifact]:
        return await self._s.scalar(
            select(XDeployArtifact)
            .where(XDeployArtifact.project_id == project_id)
            .order_by(XDeployArtifact.created_at.desc())
            .limit(1)
        )

    async def get_by_signature(self, project_id: str, signature_hex: str) -> Optional[XDeployArtifact]:
        return await self._s.scalar(
            select(XDeployArtifact).where(
                XDeployArtifact.project_id == project_id, XDeployArtifact.signature == signature_hex
            )
        )

    def read_ciphertext(self, record: XDeployArtifact) -> bytes:
        return (_ARTIFACTS_DIR.parent.parent / record.file_path).read_bytes()
