"""
Route CLI : GET /services/{slug}/install?version=latest
Authentification par API key (X-API-Key: xdk_...) — mêmes clés xdevkeys que le marketplace.
Télécharge le ZIP depuis GitHub au tag publié, le signe avec la clé HMAC du dev, le renvoie.
Miroir de app/marketplace/src/routes/install.py, adapté à Service/ServiceVersion.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import tempfile
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select, text, update

from ..models.service import Service, ServiceSubmission
from ..services.service import ServiceService

logger = logging.getLogger("hub.xservices.install")

_INSTALL_TMP = Path(tempfile.gettempdir()) / "xcore_service_install"
_INSTALL_TMP.mkdir(exist_ok=True)


async def _resolve_api_key(raw_key: str, ctx: Any) -> str:
    """Vérifie la clé API via xdevkeys (IPC `devkeys.authenticate`) — retourne
    user_id, sans vérifier de projet. Utilisé là où l'appel n'est pas lié à
    un service précis (recompute_service_from_ci, déclenché par owner/repo/tag,
    pas par slug) — voir `_resolve_api_key_for_service` pour la version scopée.

    Auparavant une requête SQL directe sur devkeys_api_keys, dupliquant à la
    main ce que xdevkeys.ApiKeyService.authenticate() fait déjà — miroir du
    même correctif appliqué à app/marketplace/src/routes/install.py."""
    response = await ctx("xdevkeys", "devkeys.authenticate", {"raw_key": raw_key})
    if response.get("status") != "ok":
        raise HTTPException(status_code=401, detail="Clé API invalide ou révoquée")
    return response["user_id"]


async def _resolve_api_key_for_service(raw_key: str, slug: str, ctx: Any) -> str:
    """Vérifie la clé API ET que son projet correspond bien à CE service —
    retourne user_id. Une clé est rattachée à un seul projet de déploiement
    (kind, slug) ; sans cette vérification, n'importe quelle clé valide
    pouvait installer n'importe quel service public, pas seulement celui
    pour lequel elle a été émise."""
    response = await ctx("xdevkeys", "devkeys.authenticate", {"raw_key": raw_key})
    if response.get("status") != "ok":
        raise HTTPException(status_code=401, detail="Clé API invalide ou révoquée")
    # Clé "personnelle" (obtenue via xcli login / device-flow, voir
    # app/xdevkeys/src/routes/device.py) — pas de projet, valide pour
    # N'IMPORTE QUELLE extension publique. Le contrôle de visibilité privé
    # plus bas dans install_service reste appliqué normalement : il ne
    # dépend que de user_id, pas de ce rattachement projet.
    if response.get("is_personal"):
        return response["user_id"]
    if response.get("project_id") is None:
        raise HTTPException(
            status_code=403,
            detail="Cette clé n'est rattachée à aucun projet de déploiement. "
            "Créez un projet (POST /xdevkeys/projects, kind='service') et une "
            "clé pour ce projet avant d'installer une extension.",
        )
    if response.get("project_kind") != "service" or response.get("project_slug") != slug:
        raise HTTPException(
            status_code=403,
            detail=f"Cette clé est rattachée au projet "
            f"'{response.get('project_kind')}/{response.get('project_slug')}', pas 'service/{slug}'.",
        )
    return response["user_id"]


def _decrypt_secret(ciphertext_hex: str, master_key: bytes, user_id: str) -> str:
    """Déchiffre un signing secret stocké par xdevkeys (XOR+PBKDF2)."""
    import hashlib as _hl
    raw = bytes.fromhex(ciphertext_hex)
    salt, ct = raw[:16], raw[16:]
    keystream = _hl.pbkdf2_hmac(
        "sha256", master_key + user_id.encode(), salt, 100_000, dklen=len(ct)
    )
    return bytes(a ^ b for a, b in zip(ct, keystream)).decode()


async def _get_signing_secret(user_id: str, db: Any, master_key: bytes) -> str:
    async with db.session() as session:
        result = await session.execute(
            text("SELECT secret_encrypted FROM devkeys_signing_keys WHERE user_id=:uid"),
            {"uid": user_id},
        )
        row = result.fetchone()
    if row is None:
        raise HTTPException(
            status_code=400,
            detail="Aucune clé de signature configurée. Créez-en une sur le marketplace.",
        )
    try:
        return _decrypt_secret(row[0], master_key, user_id)
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Clé de signature corrompue. Régénérez-la via POST /xdevkeys/signing-key.",
        )


async def _verify_tag(repo_owner: str, repo_name: str, ref: str, github_token: str | None) -> bool:
    headers = {"Accept": "application/vnd.github+json"}
    if github_token:
        headers["Authorization"] = f"Bearer {github_token}"
    url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/git/refs/tags/{ref}"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(url, headers=headers)
    return resp.status_code == 200


async def _download_zip(repo_owner: str, repo_name: str, ref: str, github_token: str | None) -> bytes:
    headers = {"Accept": "application/vnd.github+json"}
    if github_token:
        headers["Authorization"] = f"Bearer {github_token}"
    url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/zipball/{ref}"
    async with httpx.AsyncClient(follow_redirects=True, timeout=60) as client:
        resp = await client.get(url, headers=headers)
    if resp.status_code == 404:
        raise HTTPException(
            status_code=404, detail=f"Repo GitHub '{repo_owner}/{repo_name}@{ref}' introuvable"
        )
    if resp.status_code == 401:
        raise HTTPException(status_code=400, detail="Token GitHub invalide. Reliez votre compte GitHub.")
    resp.raise_for_status()
    return resp.content


def _sign_zip(data: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), data, hashlib.sha256).hexdigest()


def service_install_router(db: Any, master_key: bytes, ctx: Any) -> APIRouter:
    router = APIRouter(prefix="/services", tags=["xservices-install"])

    @router.get("/{slug}/install")
    async def install_service(
        slug: str,
        version: str = Query("latest", description="Version de l'extension (ex: 1.0.0 ou 'latest')"),
        x_api_key: str = Header(..., alias="X-API-Key", description="Clé API xcore (xdk_...)"),
    ) -> Response:
        """
        Endpoint CLI — télécharge et signe le ZIP d'une extension de service.

        Retourne :
          - Corps       : ZIP binaire
          - X-Signature : hmac_sha256:<hex>
          - X-Service   : nom@version
          - X-Repo      : owner/repo@ref
        """
        user_id = await _resolve_api_key_for_service(x_api_key, slug, ctx)

        async with db.session() as session:
            svc = await ServiceService(session).get_by_slug(slug)
        if svc is None or not svc.is_published:
            raise HTTPException(status_code=404, detail=f"Extension '{slug}' introuvable ou non publiée")

        if svc.visibility == "private":
            allowed = user_id == svc.developer_id
            if not allowed and svc.tenant_id:
                access = await ctx(
                    "auth",
                    "xauth.tenant_access",
                    {"user_id": user_id, "tenant_id": svc.tenant_id, "permissions": []},
                )
                allowed = access.get("status") == "ok" and access.get("has_access", False)
            if not allowed:
                raise HTTPException(status_code=404, detail=f"Extension '{slug}' introuvable ou non publiée")

        target_version: str | None = None
        if version == "latest":
            stable = [v for v in svc.versions if v.is_stable and not v.is_yanked]
            if stable:
                target_version = stable[0].version
            elif svc.versions:
                target_version = svc.versions[0].version
            else:
                raise HTTPException(status_code=404, detail="Aucune version disponible")
        else:
            match = [v for v in svc.versions if v.version == version and not v.is_yanked]
            if not match:
                raise HTTPException(status_code=404, detail=f"Version '{version}' introuvable ou retirée")
            target_version = version

        if not svc.repository:
            raise HTTPException(status_code=400, detail="Cette extension n'a pas de repo GitHub configuré")

        repo_str = svc.repository.removeprefix("https://github.com/").strip("/")
        parts = repo_str.split("/")
        if len(parts) < 2:
            raise HTTPException(status_code=400, detail=f"URL de repo invalide : {svc.repository}")
        repo_owner, repo_name = parts[0], parts[1]

        async with db.session() as session:
            sub_row = await session.scalar(
                select(ServiceSubmission)
                .where(
                    ServiceSubmission.service_name == svc.name,
                    ServiceSubmission.service_version == target_version,
                    ServiceSubmission.source == "github",
                    ServiceSubmission.github_branch.isnot(None),
                )
                .order_by(ServiceSubmission.created_at.desc())
            )
        ref = sub_row.github_branch if sub_row and sub_row.github_branch else target_version

        async with db.session() as session:
            from app.marketplace.src.models.github import DeveloperGitHubToken

            gh_token_row = await session.scalar(
                select(DeveloperGitHubToken).where(
                    DeveloperGitHubToken.user_id == svc.developer_id
                )
            )
        github_token = gh_token_row.access_token if gh_token_row else None

        if not await _verify_tag(repo_owner, repo_name, ref, github_token):
            raise HTTPException(
                status_code=400,
                detail=f"La version '{target_version}' ne correspond à aucun tag Git existant "
                f"sur {repo_owner}/{repo_name} (ref='{ref}'). Le déploiement doit être fait "
                "depuis un tag Git.",
            )

        logger.info("[install] %s@%s ← %s/%s@%s", slug, target_version, repo_owner, repo_name, ref)
        zip_data = await _download_zip(repo_owner, repo_name, ref, github_token)

        secret = await _get_signing_secret(user_id, db, master_key)
        signature = _sign_zip(zip_data, secret)

        logger.info("[install] %s@%s signé — %d octets", slug, target_version, len(zip_data))

        # Incrémenter le compteur d'installations — jusqu'ici seul
        # POST /services/{slug}/install (déclenché manuellement côté
        # frontend, JWT) l'incrémentait ; ce endpoint-ci (GET, X-API-Key)
        # est le vrai "quelqu'un a installé cette extension" via
        # xcore-agent, et ne le touchait pas du tout — même trou que côté
        # marketplace/routes/install.py.
        async with db.session() as session:
            await session.execute(
                update(Service).where(Service.id == svc.id).values(install_count=Service.install_count + 1)
            )
            await session.commit()

        return Response(
            content=zip_data,
            media_type="application/zip",
            headers={
                "X-Signature": f"hmac_sha256:{signature}",
                "X-Service": f"{svc.name}@{target_version}",
                "X-Repo": f"{repo_owner}/{repo_name}@{ref}",
                "Content-Disposition": f'attachment; filename="{slug}-{target_version}.zip"',
            },
        )

    return router
