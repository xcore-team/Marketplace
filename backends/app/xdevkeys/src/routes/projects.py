from __future__ import annotations

from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, status
from xcore.kernel.api import AuthPayload, get_current_user

from ..schemas.project import ProjectCreate, ProjectOut
from ..services.project import ProjectService


def projects_router(db: Any) -> APIRouter:
    router = APIRouter(prefix="/projects", tags=["devkeys"])

    @router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
    async def create_project(
        body: ProjectCreate,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Crée un projet de déploiement — la cible qu'une clé API pourra
        ensuite être seule à pouvoir installer/déployer (une clé = un projet)."""
        async with db.session() as session:
            try:
                project = await ProjectService(session).create(
                    owner_id=user["sub"], name=body.name, kind=body.kind, slug=body.slug
                )
                await session.commit()
                await session.refresh(project)
                return project
            except ValueError as exc:
                raise HTTPException(status_code=409, detail=str(exc))

    @router.get("", response_model=List[ProjectOut])
    async def list_projects(
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Liste les projets de déploiement du développeur connecté."""
        async with db.session() as session:
            return await ProjectService(session).list_by_owner(user["sub"])

    @router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_project(
        project_id: str,
        user: AuthPayload = Depends(get_current_user),
    ) -> None:
        """Supprime un projet — refusé tant que des clés API actives y sont rattachées."""
        async with db.session() as session:
            try:
                deleted = await ProjectService(session).delete(project_id, user["sub"])
            except ValueError as exc:
                raise HTTPException(status_code=409, detail=str(exc))
            if not deleted:
                raise HTTPException(status_code=404, detail="Projet introuvable")
            await session.commit()

    return router
