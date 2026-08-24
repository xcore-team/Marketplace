"""Stockage des artefacts `.xdeploy` scellés — via extensions/xstorage
(ext.storage, backend local par défaut, S3/R2/Supabase en configurant
integration.yaml), jamais en base (un artefact peut faire plusieurs Mo ; le
flux marketplace lui-même ne persiste jamais de ZIP, il re-fetch GitHub à
chaque install — voir routes/install.py côté marketplace ; ici on ne peut pas
re-générer un artefact à l'identique à la demande puisqu'il est scellé sous
un DEK propre à ce build précis, donc il faut vraiment le garder quelque
part une fois).

Namespace xstorage = "xdeploy/{project_id}" ; project_id est un identifiant
opaque émis par le Hub (prj_<hex>), jamais choisi par le client — pas de
risque de collision/traversal ici. `stored_name` (retourné par save(), pas
reconstructible depuis file_id seul — voir uploader.py côté xstorage) est
persisté en base, requis pour read()/delete().
"""
from __future__ import annotations

from typing import Any, Optional
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.artifact import XDeployArtifact


def _namespace(project_id: str) -> str:
    return f"xdeploy/{project_id}"


class ArtifactService:
    def __init__(self, session: AsyncSession, storage: Any) -> None:
        self._s = session
        self._storage = storage

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

        # ext.storage (extxstorage) refuse toute extension hors de sa liste
        # blanche fixe (documents/images/archives) — ".xdeploy" n'y figure
        # pas et n'y sera jamais ajouté (c'est un service de stockage
        # générique partagé par d'autres plugins, pas la responsabilité de
        # xdeploy de l'élargir). L'extension du nom stocké n'a aucun effet
        # sur la relecture (read_ciphertext utilise file_id + stored_name,
        # jamais l'extension) : on stocke donc sous ".zip", déjà autorisé,
        # purement pour passer la validation — le contenu reste le
        # ciphertext AES-256-GCM scellé, pas un vrai zip.
        uploaded = await self._storage.save(
            ciphertext, f"{uuid4().hex}.zip", namespace=_namespace(project_id)
        )

        record = XDeployArtifact(
            project_id=project_id,
            project_name=project_name,
            version=version,
            stored_name=uploaded.stored_name,
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

    async def list_for_project(self, project_id: str) -> list[XDeployArtifact]:
        result = await self._s.execute(
            select(XDeployArtifact)
            .where(XDeployArtifact.project_id == project_id)
            .order_by(XDeployArtifact.created_at.desc())
        )
        return list(result.scalars().all())

    async def delete(self, record: XDeployArtifact) -> None:
        """Supprime le blob chiffré ET la ligne de métadonnées. Contredit
        volontairement l'immuabilité (project_id, version) affirmée dans
        publish() — un développeur doit pouvoir retirer un artefact publié
        par erreur ou compromis. Une fois cette ligne effacée, publish()
        n'y voit plus d'obstacle (son check d'immuabilité ne porte que sur
        les lignes existantes) : la même version redevient publiable — pas
        un "yank" façon npm qui bloquerait durablement le numéro."""
        await self._storage.delete(
            record.id, _namespace(record.project_id), stored_name=record.stored_name
        )
        await self._s.delete(record)

    async def get_by_signature(self, project_id: str, signature_hex: str) -> Optional[XDeployArtifact]:
        return await self._s.scalar(
            select(XDeployArtifact).where(
                XDeployArtifact.project_id == project_id, XDeployArtifact.signature == signature_hex
            )
        )

    async def read_ciphertext(self, record: XDeployArtifact) -> bytes:
        content = await self._storage.read(
            record.id, _namespace(record.project_id), stored_name=record.stored_name
        )
        if content is None:
            raise FileNotFoundError(
                f"Artefact '{record.id}' introuvable dans le stockage (stored_name={record.stored_name!r})."
            )
        return content
