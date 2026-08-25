"""Routes navigateur (JWT) pour gérer les artefacts .xdeploy déjà publiés —
lister/supprimer les versions d'un projet depuis Déploiements. Distinct de
routes/hub.py (contrat xcore-agent, authentifié par xdevkey/jeton de
session) : ici l'appelant est un développeur connecté au Hub via son
navigateur, jamais l'agent CLI.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from xcore.kernel.api import AuthPayload, get_current_user

from ..services.artifact import ArtifactService


class ArtifactOut(BaseModel):
    id: str
    project_id: str
    project_name: str
    version: str
    size_bytes: int
    content_sha256: str
    publisher_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


def dev_router(db: Any, ctx: Any, storage: Any) -> APIRouter:
    # Pas de prefix="/projects" ici : delete_artifact ci-dessous est
    # volontairement hors de ce préfixe (un artefact se supprime par son
    # propre id, pas scopé à un projet — voir frontend api/index.ts::
    # xdeployArtifacts.delete, qui appelle DELETE /xdeploy/artifacts/{id}
    # sans /projects). Avec le prefix au niveau du router, cette route
    # atterrissait par erreur sur /projects/artifacts/{artifact_id} — 404
    # systématique côté frontend, jamais reproduit puisque list_artifacts
    # (qui, elle, VEUT bien /projects/{id}/artifacts) fonctionnait très
    # bien et masquait le problème. Chaque route porte donc son chemin
    # complet explicitement plutôt qu'un prefix partagé.
    router = APIRouter(tags=["xdeploy-dev"])

    async def _require_owner(project_id: str, user_id: str) -> None:
        response = await ctx(
            "xdevkeys", "devkeys.check_project_owner",
            {"project_slug": project_id, "user_id": user_id},
        )
        if response.get("status") != "ok":
            raise HTTPException(status_code=404, detail="Projet introuvable")
        if not response.get("owned"):
            raise HTTPException(status_code=403, detail="Ce projet ne vous appartient pas")

    @router.get("/projects/{project_id}/artifacts", response_model=List[ArtifactOut])
    async def list_artifacts(
        project_id: str,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Historique des versions .xdeploy publiées pour ce projet — le Hub
        ne voit jamais leur contenu (chiffré), seules ces métadonnées."""
        await _require_owner(project_id, user["sub"])
        async with db.session() as session:
            return await ArtifactService(session, storage).list_for_project(project_id)

    @router.delete("/artifacts/{artifact_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_artifact(
        artifact_id: str,
        user: AuthPayload = Depends(get_current_user),
    ) -> None:
        """Retire un artefact publié — supprime le blob chiffré ET ses
        métadonnées. Un déploiement déjà en cours qui dépend de cette
        signature exacte cessera de pouvoir en récupérer le DEK."""
        async with db.session() as session:
            svc = ArtifactService(session, storage)
            record = await svc.get_by_id(artifact_id)
            if record is None:
                raise HTTPException(status_code=404, detail="Artefact introuvable")
            await _require_owner(record.project_id, user["sub"])
            await svc.delete(record)
            await session.commit()

    return router
