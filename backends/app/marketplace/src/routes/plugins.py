from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from xcore.kernel.api import AuthPayload, get_current_user
from xcore.sdk import require_permission

from ..models.plugin import Plugin, PluginVersion
from ..models.submission import Submission
from ..schemas.plugin import PluginCreate, PluginOut, PluginUpdate
from ..schemas.rating import RatingCreate, RatingOut
from ..schemas.submission import SubmissionOut
from ..services.plugin import PluginService
from ..services.rating import RatingService


async def _optional_user(request: Request) -> Optional[AuthPayload]:
    """Comme get_current_user, mais retourne None au lieu de 401 — pour les routes publiques
    qui doivent tout de même élargir la visibilité pour un utilisateur connecté (privé/org)."""
    try:
        return await get_current_user(request, None)  # type: ignore[arg-type]
    except Exception:
        return None


def _current_tenant_id(user: Optional[Any]) -> Optional[str]:
    """Lecture défensive du claim tenant_id — voir app/auth/src/routes/rbac.py's
    _current_tenant pour le même pattern (a existé à plat OU sous user.tenant_id
    selon le chemin de code qui a émis le token)."""
    if not user:
        return None
    return user.get("tenant_id") or (user.get("user") or {}).get("tenant_id")


def _viewer_tenant_ids(viewer: Optional[Any]) -> set:
    """Équipes dont la visibilité "privé" doit tenir compte pour ce viewer —
    aujourd'hui limité à son équipe active (claim JWT), pas "toutes les
    équipes dont il a jamais été membre" (ce que faisait l'ancien xorgs via
    un import direct cross-plugin — voir xauth.tenant_access pour le
    contrôle equivalent côté gestion)."""
    tenant_id = _current_tenant_id(viewer)
    return {tenant_id} if tenant_id else set()


class _Page:
    """Envelope de pagination légère."""

    def __init__(self, items, total, limit, offset):
        self.items = items
        self.total = total
        self.limit = limit
        self.offset = offset
        self.has_more = offset + limit < total


def plugins_router(db: Any, ctx: Any) -> APIRouter:
    router = APIRouter(prefix="/plugins", tags=["plugins"])

    # ── Public ────────────────────────────────────────────────────────────────

    @router.get("/check-name")
    async def check_plugin_name(
        name: str = Query(..., description="Nom du plugin à vérifier"),
    ) -> Any:
        """Vérifie si un nom de plugin est déjà pris — public. Utile avant soumission."""
        slug = name.lower().strip().replace(" ", "-")
        async with db.session() as session:
            existing = await session.scalar(select(Plugin).where(Plugin.slug == slug))
        return {"name": name, "slug": slug, "available": existing is None}

    @router.get("")
    async def list_plugins(
        limit: int = Query(50, ge=1, le=200),
        offset: int = Query(0, ge=0),
        search: Optional[str] = Query(
            None, description="Recherche par nom ou description"
        ),
        category_id: Optional[str] = Query(None, description="Filtrer par catégorie"),
        sort: Optional[str] = Query(
            "newest", description="Tri : newest, downloads, rating"
        ),
        viewer: Optional[AuthPayload] = Depends(_optional_user),
    ) -> Any:
        """
        Liste les plugins publiés — publique. Les plugins privés (visibility="private")
        n'apparaissent que pour leur propriétaire ou un membre de l'équipe propriétaire.
        Retourne {items, total, limit, offset, has_more}.
        """
        viewer_id = viewer["sub"] if viewer else None
        viewer_tenant_ids = _viewer_tenant_ids(viewer)
        async with db.session() as session:
            svc = PluginService(session)
            total = await svc.count_published(
                search=search, category_id=category_id,
                viewer_id=viewer_id, viewer_tenant_ids=viewer_tenant_ids,
            )
            items = await svc.list_published(
                limit=limit,
                offset=offset,
                search=search,
                category_id=category_id,
                sort=sort,
                viewer_id=viewer_id,
                viewer_tenant_ids=viewer_tenant_ids,
            )
            return {
                "items": [PluginOut.model_validate(p) for p in items],
                "total": total,
                "limit": limit,
                "offset": offset,
                "has_more": offset + limit < total,
            }

    @router.get("/mine", response_model=List[PluginOut])
    async def my_plugins_by_api_key(
        x_api_key: str = Header(..., alias="X-API-Key", description="Clé API xcore (xdk_...)"),
    ) -> Any:
        """Équivalent de /me/plugins pour un appelant CLI (X-API-Key, pas de
        session JWT) — même trou que celui déjà comblé par GET /{slug}/install
        pour l'installation d'un plugin privé : un développeur qui a une
        clé xdevkeys mais jamais ouvert de session navigateur (xcli login
        fait un device-code flow, jamais un login web) n'a aucun moyen de
        lister SES plugins, publics et privés confondus, tant que ce
        endpoint n'existe pas — voir xcli/plugin/marketplace_commands.py::mine.

        Déclaré AVANT /{slug} ci-dessous : même segment unique ("mine"),
        donc l'ordre d'enregistrement des routes FastAPI est ce qui évite
        que /{slug} n'intercepte /plugins/mine en le prenant pour un slug.

        Une clé "personnelle" (device-flow, voir app/xdevkeys/src/routes/
        device.py) n'a pas de project_id : c'est la clé de son porteur, pas
        d'un plugin précis, donc pas de vérification de rattachement projet
        ici (contrairement à /{slug}/install) — juste résoudre user_id."""
        from .install import _resolve_api_key

        user_id = await _resolve_api_key(x_api_key, db, ctx)
        async with db.session() as session:
            return await PluginService(session).list_by_developer(user_id)

    @router.get("/{slug}", response_model=PluginOut)
    async def get_plugin(
        slug: str,
        viewer: Optional[AuthPayload] = Depends(_optional_user),
    ) -> Any:
        """Détails d'un plugin — public si visibility="public", sinon réservé au propriétaire
        ou aux membres de l'équipe propriétaire. Incrémente le compteur de téléchargements."""
        viewer_id = viewer["sub"] if viewer else None
        viewer_tenant_ids = _viewer_tenant_ids(viewer)
        async with db.session() as session:
            svc = PluginService(session)
            plugin = await svc.get_by_slug(slug)
            if plugin is None:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            if not await svc.can_view(plugin, viewer_id, viewer_tenant_ids):
                raise HTTPException(status_code=404, detail="Plugin introuvable")

            plugin.download_count = (plugin.download_count or 0) + 1

            response = await ctx(
                "auth", "xauth.get_user", {"user_id": plugin.developer_id}
            )
            await session.refresh(plugin)
            out = PluginOut.model_validate(plugin)
            if response.get("status") == "ok":
                out = out.model_copy(update={"dev_mail": response.get("user", {}).get("email")})
            await session.commit()
            return out

    # ── Authentifié ───────────────────────────────────────────────────────────

    @router.get("/me/plugins", response_model=List[PluginOut])
    async def my_plugins(
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Plugins du développeur connecté."""
        async with db.session() as session:
            return await PluginService(session).list_by_developer(user["sub"])

    # ── RBAC : plugin:create ──────────────────────────────────────────────────

    @router.post("", response_model=PluginOut, status_code=status.HTTP_201_CREATED)
    async def create_plugin(
        body: PluginCreate,
        # "plugins:write" (pluriel) n'a jamais existé dans le catalogue RBAC
        # seedé (voir app/auth/src/services/seed.py::PERMISSIONS) — cette
        # route était donc inaccessible à TOUT LE MONDE, admin compris,
        # jusqu'à ce correctif. "plugin:create" est le nom réel du catalogue.
        user: AuthPayload = Depends(require_permission("plugin:create")),
    ) -> Any:
        """Crée une fiche plugin. Requiert la permission plugin:create.
        Rattaché automatiquement à l'équipe active de l'appelant (claim tenant_id
        du JWT) — pas de vérification d'appartenance à faire, contrairement à
        l'ancien organization_id : on ne peut pas demander un tenant_id
        arbitraire dans le corps de la requête, seulement celui déjà validé
        par l'auth. tenant_id=None (pas d'équipe active) donne un plugin
        personnel, comme un plugin créé avant l'existence des équipes."""
        async with db.session() as session:
            try:
                plugin = await PluginService(session).create(
                    developer_id=user["sub"],
                    name=body.name,
                    description=body.description,
                    homepage=body.homepage,
                    repository=body.repository,
                    category_ids=body.category_ids or [],
                    visibility=body.visibility,
                    tenant_id=_current_tenant_id(user),
                )
                await session.commit()
                await session.refresh(plugin)
                return plugin
            except ValueError as exc:
                raise HTTPException(status_code=409, detail=str(exc))

    @router.patch("/{slug}", response_model=PluginOut)
    async def update_plugin(
        slug: str,
        body: PluginUpdate,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Met à jour description, homepage, repository d'un plugin (propriétaire uniquement)."""
        async with db.session() as session:
            plugin = await PluginService(session).get_by_slug(slug)
            if plugin is None or plugin.developer_id != user["sub"]:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            if body.description is not None:
                plugin.description = body.description
            if body.homepage is not None:
                plugin.homepage = body.homepage or None
            if body.repository is not None:
                plugin.repository = body.repository or None
            if body.visibility is not None:
                if body.visibility not in ("public", "private"):
                    raise HTTPException(status_code=400, detail="visibility doit être 'public' ou 'private'")
                plugin.visibility = body.visibility
            await session.commit()
            await session.refresh(plugin)
            return PluginOut.model_validate(plugin)

    @router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_plugin(
        slug: str,
        user: AuthPayload = Depends(require_permission("plugin:delete")),
    ) -> None:
        """Supprime un plugin (propriétaire uniquement). Requiert plugins:write."""
        async with db.session() as session:
            plugin = await PluginService(session).get_by_slug(slug)
            if plugin is None or plugin.developer_id != user["sub"]:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            await session.delete(plugin)
            await session.commit()

    # ── Notation ─────────────────────────────────────────────────────────────

    @router.post(
        "/{slug}/ratings", response_model=RatingOut, status_code=status.HTTP_201_CREATED
    )
    async def rate_plugin(
        slug: str,
        body: RatingCreate,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Soumet ou met à jour la note (1–5) de l'utilisateur pour un plugin."""
        async with db.session() as session:
            plugin = await PluginService(session).get_by_slug(slug)
            if plugin is None or not plugin.is_published:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            if plugin.developer_id == user["sub"]:
                raise HTTPException(
                    status_code=403,
                    detail="Vous ne pouvez pas noter votre propre plugin.",
                )
            try:
                rating = await RatingService(session).rate(
                    plugin=plugin,
                    user_id=user["sub"],
                    score=body.score,
                    comment=body.comment,
                )
                await session.commit()
                return rating
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))

    @router.get("/{slug}/ratings")
    async def list_plugin_ratings(
        slug: str,
        limit: int = Query(20, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ) -> Any:
        """Liste les notes d'un plugin — public. Retourne {items, total, limit, offset, has_more}."""
        async with db.session() as session:
            plugin = await PluginService(session).get_by_slug(slug)
            if plugin is None:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            return await RatingService(session).list_ratings(
                plugin.id, limit=limit, offset=offset
            )

    @router.get("/{slug}/ratings/me", response_model=RatingOut)
    async def my_rating(
        slug: str,
        user: AuthPayload = Depends(get_current_user),
    ) -> Any:
        """Retourne la note de l'utilisateur connecté pour ce plugin."""
        async with db.session() as session:
            plugin = await PluginService(session).get_by_slug(slug)
            if plugin is None:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            rating = await RatingService(session).get_user_rating(
                plugin.id, user["sub"]
            )
            if rating is None:
                raise HTTPException(
                    status_code=404, detail="Vous n'avez pas encore noté ce plugin."
                )
            return rating

    @router.get("/{slug}/submissions")
    async def plugin_submissions(
        slug: str,
        viewer: Optional[AuthPayload] = Depends(_optional_user),
    ) -> Any:
        """Soumissions d'un plugin — public si le plugin l'est. Utilisé pour afficher le
        rapport de sécurité. Un plugin privé n'expose ses soumissions qu'à son propriétaire
        ou aux membres de l'équipe propriétaire."""
        viewer_id = viewer["sub"] if viewer else None
        viewer_tenant_ids = _viewer_tenant_ids(viewer)
        async with db.session() as session:
            svc = PluginService(session)
            plugin = await svc.get_by_slug(slug)
            if plugin is None:
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            if not await svc.can_view(plugin, viewer_id, viewer_tenant_ids):
                raise HTTPException(status_code=404, detail="Plugin introuvable")
            result = await session.execute(
                select(Submission)
                .where(Submission.plugin_name == plugin.name)
                .where(Submission.developer_id == plugin.developer_id)
                .order_by(Submission.created_at.desc())
            )
            subs = result.scalars().all()
            return [SubmissionOut.model_validate(s) for s in subs]

    return router
