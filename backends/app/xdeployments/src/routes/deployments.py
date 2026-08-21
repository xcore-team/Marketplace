from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from xcore.kernel.api import AuthPayload, get_current_user

from ..schemas.deployment import DeploymentOut, DeploymentReportIn
from ..services.deployment import DeploymentService


def deployments_router(db: Any, ctx: Any) -> APIRouter:
    router = APIRouter(prefix="/deployments", tags=["deployments"])

    @router.post(
        "/report", response_model=DeploymentOut, status_code=status.HTTP_201_CREATED
    )
    async def report_deployment(
        body: DeploymentReportIn,
        x_api_key: str = Header(
            ..., alias="X-API-Key", description="Clé API xcore (xdk_...)"
        ),
    ) -> Any:
        """
        Appelé par xcore-agent en fin de déploiement (succès ou échec) — voir
        MarketplaceDeploymentRunner. Authentifié par clé API (un agent tournant
        sur un VPS n'a pas de session JWT). Chaque appel crée une nouvelle
        ligne : c'est un journal, pas un upsert d'état.
        """
        # Authentifié via l'IPC xdevkeys (devkeys.authenticate), pas un import
        # direct de app.marketplace.src.routes.install._resolve_api_key comme
        # avant — xdeployments n'a aucune raison de dépendre du module de
        # routes internes d'un autre plugin pour vérifier une clé API que
        # xdevkeys expose déjà proprement en IPC.
        auth_result = await ctx("xdevkeys", "devkeys.authenticate", {"raw_key": x_api_key})
        if auth_result.get("status") != "ok":
            raise HTTPException(status_code=401, detail="Clé API invalide ou révoquée")
        # Une clé est rattachée à UN projet de déploiement (kind, slug) : elle
        # ne peut rapporter des déploiements QUE pour cette cible, jamais pour
        # un plugin/service arbitraire — sinon une clé compromise permettrait
        # de polluer l'historique de déploiement de n'importe quelle cible
        # publique du marketplace.
        if auth_result.get("project_id") is None:
            raise HTTPException(
                status_code=403,
                detail="Cette clé n'est rattachée à aucun projet de déploiement. "
                "Créez un projet (POST /xdevkeys/projects) et une clé pour ce "
                "projet avant de rapporter un déploiement.",
            )
        if auth_result.get("project_kind") != body.kind or auth_result.get("project_slug") != body.slug:
            raise HTTPException(
                status_code=403,
                detail=f"Cette clé est rattachée au projet "
                f"'{auth_result.get('project_kind')}/{auth_result.get('project_slug')}', "
                f"pas '{body.kind}/{body.slug}'.",
            )
        deployer_id = auth_result["user_id"]

        async with db.session() as session:
            try:
                deployment = await DeploymentService(session).report(
                    deployer_id=deployer_id,
                    kind=body.kind,
                    slug=body.slug,
                    version=body.version,
                    status=body.status,
                    started_at=body.started_at,
                    completed_at=body.completed_at,
                    host_id=body.host_id,
                    repo=body.repo,
                    error_message=body.error_message,
                )
                await session.commit()
                await session.refresh(deployment)
                return deployment
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))

    @router.get("", response_model=List[DeploymentOut])
    async def list_my_deployments(
        slug: Optional[str] = Query(None),
        host_id: Optional[str] = Query(None),
        status_filter: Optional[str] = Query(None, alias="status"),
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Historique des déploiements rapportés par l'utilisateur connecté (tous hosts confondus)."""
        async with db.session() as session:
            return await DeploymentService(session).list_for_deployer(
                user["sub"],
                slug=slug,
                host_id=host_id,
                status=status_filter,
                limit=limit,
                offset=offset,
            )

    @router.get("/{kind}/{slug}/hosts", response_model=List[DeploymentOut])
    async def deployment_fleet_status(
        kind: str,
        slug: str,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """État courant (dernier rapport) par host pour un plugin/extension —
        vue "flotte" : quels VPS tournent quelle version, et le dernier déploiement
        a-t-il réussi. Limité aux déploiements de l'utilisateur connecté."""
        # "xdeploy" (bundle multi-plugins scellé) reporte aussi dans cette
        # même table — voir app/xdeploy/src/routes/hub.py::_log_deployment,
        # qui écrit kind="xdeploy" depuis le début. Cette liste blanche
        # n'avait pas suivi : le report marchait, mais la vue flotte d'un
        # projet Bundle renvoyait 400 à chaque chargement.
        if kind not in ("plugin", "service", "xdeploy"):
            raise HTTPException(
                status_code=400, detail="kind doit être 'plugin', 'service' ou 'xdeploy'"
            )
        async with db.session() as session:
            return await DeploymentService(session).latest_per_host(
                user["sub"], kind=kind, slug=slug
            )

    return router
