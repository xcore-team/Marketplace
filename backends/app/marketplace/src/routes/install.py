"""
Route CLI : GET /plugins/{slug}/install?version=latest
Authentification par API key (X-API-Key: xdk_...).
Télécharge le ZIP depuis GitHub, le signe avec la clé HMAC du dev, le renvoie.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import tempfile
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
from fastapi import APIRouter, Header, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import select, text

from ..models.github import DeveloperGitHubToken
from ..models.plugin import Plugin
from ..models.submission import Submission
from ..services.plugin import PluginService

logger = logging.getLogger("hub.marketplace.install")

_INSTALL_TMP = Path(tempfile.gettempdir()) / "xcore_install"
_INSTALL_TMP.mkdir(exist_ok=True)


async def _resolve_api_key(raw_key: str, db: Any, ctx: Any) -> str:
    """Vérifie la clé API via xdevkeys (IPC `devkeys.authenticate`) — retourne
    user_id, sans vérifier de projet. Utilisé là où l'appel n'est pas lié à
    un plugin précis (ex: recompute_from_ci dans github.py, déclenché par
    owner/repo/tag, pas par slug) — voir `_resolve_api_key_for_plugin`
    ci-dessous pour la version qui vérifie le rattachement à un projet."""
    response = await ctx("xdevkeys", "devkeys.authenticate", {"raw_key": raw_key})
    if response.get("status") != "ok":
        raise HTTPException(status_code=401, detail="Clé API invalide ou révoquée")
    return response["user_id"]


async def _resolve_api_key_for_plugin(raw_key: str, slug: str, ctx: Any) -> str:
    """Vérifie la clé API via xdevkeys (IPC `devkeys.authenticate`) ET que son
    projet correspond bien à CE plugin — retourne user_id.

    Une clé est rattachée à un seul projet de déploiement (kind, slug) ; sans
    cette vérification, n'importe quelle clé valide pouvait installer
    n'importe quel plugin public, pas seulement celui pour lequel elle a été
    émise.

    Auparavant une requête SQL directe sur devkeys_api_keys, dupliquant à la
    main ce que xdevkeys.ApiKeyService.authenticate() fait déjà (hash,
    vérification is_active, last_used_at) — deux implémentations du même
    contrôle d'accès à faire évoluer en synchronie, exactement le genre de
    duplication qui finit par diverger silencieusement."""
    response = await ctx("xdevkeys", "devkeys.authenticate", {"raw_key": raw_key})
    if response.get("status") != "ok":
        raise HTTPException(status_code=401, detail="Clé API invalide ou révoquée")
    if response.get("project_id") is None:
        raise HTTPException(
            status_code=403,
            detail="Cette clé n'est rattachée à aucun projet de déploiement. "
            "Créez un projet (POST /xdevkeys/projects) et une clé pour ce "
            "projet avant d'installer un plugin.",
        )
    if response.get("project_kind") != "plugin" or response.get("project_slug") != slug:
        raise HTTPException(
            status_code=403,
            detail=f"Cette clé est rattachée au projet '{response.get('project_slug')}', "
            f"pas '{slug}'.",
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
    """Récupère et déchiffre le signing secret de l'utilisateur."""
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
    """Vérifie que `ref` est un tag Git existant sur le repo (déploiement forcé sur tag)."""
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
        raise HTTPException(status_code=404, detail=f"Repo GitHub '{repo_owner}/{repo_name}@{ref}' introuvable")
    if resp.status_code == 401:
        raise HTTPException(status_code=400, detail="Token GitHub invalide. Reliez votre compte GitHub.")
    resp.raise_for_status()
    return resp.content


def _sign_zip(data: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), data, hashlib.sha256).hexdigest()


def install_router(db: Any, master_key: bytes, ctx: Any) -> APIRouter:
    router = APIRouter(prefix="/plugins", tags=["install"])

    @router.get("/{slug}/install")
    async def install_plugin(
        slug: str,
        version: str = Query("latest", description="Version du plugin (ex: 1.0.0 ou 'latest')"),
        x_api_key: str = Header(..., alias="X-API-Key", description="Clé API xcore (xdk_...)"),
    ) -> Response:
        """
        Endpoint CLI — télécharge et signe le ZIP d'un plugin.

        Retourne :
          - Corps       : ZIP binaire
          - X-Signature : hmac_sha256:<hex>
          - X-Plugin    : nom@version
          - X-Repo      : owner/repo@ref
        """
        # 1. Authentifier la clé API — et vérifier qu'elle est bien rattachée à CE plugin
        user_id = await _resolve_api_key_for_plugin(x_api_key, slug, ctx)

        # 2. Récupérer le plugin
        async with db.session() as session:
            plugin = await PluginService(session).get_by_slug(slug)
        if plugin is None or not plugin.is_published:
            raise HTTPException(status_code=404, detail=f"Plugin '{slug}' introuvable ou non publié")

        # 2bis. Un plugin privé n'est installable que par son propriétaire ou un membre
        # de l'équipe propriétaire (la clé API identifie déjà l'appelant) — via IPC
        # xauth.tenant_access, pas un import direct d'un autre plugin.
        if plugin.visibility == "private":
            allowed = user_id == plugin.developer_id
            if not allowed and plugin.tenant_id:
                access = await ctx(
                    "auth",
                    "xauth.tenant_access",
                    {"user_id": user_id, "tenant_id": plugin.tenant_id, "permissions": []},
                )
                allowed = access.get("status") == "ok" and access.get("has_access", False)
            if not allowed:
                raise HTTPException(status_code=404, detail=f"Plugin '{slug}' introuvable ou non publié")

        # 3. Résoudre la version
        target_version: str | None = None
        if version == "latest":
            stable = [v for v in plugin.versions if v.is_stable and not v.is_yanked]
            if stable:
                target_version = stable[0].version
            elif plugin.versions:
                target_version = plugin.versions[0].version
            else:
                raise HTTPException(status_code=404, detail="Aucune version disponible")
        else:
            match = [v for v in plugin.versions if v.version == version and not v.is_yanked]
            if not match:
                raise HTTPException(status_code=404, detail=f"Version '{version}' introuvable ou retirée")
            target_version = version

        # 4. Extraire le repo GitHub depuis plugin.repository
        if not plugin.repository:
            raise HTTPException(status_code=400, detail="Ce plugin n'a pas de repo GitHub configuré")

        # Formats acceptés : https://github.com/owner/repo  ou  owner/repo
        repo_str = plugin.repository.removeprefix("https://github.com/").strip("/")
        parts = repo_str.split("/")
        if len(parts) < 2:
            raise HTTPException(status_code=400, detail=f"URL de repo invalide : {plugin.repository}")
        repo_owner, repo_name = parts[0], parts[1]

        # 5. Chercher la branche utilisée pour publier cette version
        async with db.session() as session:
            sub_row = await session.scalar(
                select(Submission)
                .where(
                    Submission.plugin_name == plugin.name,
                    Submission.plugin_version == target_version,
                    Submission.source == "github",
                    Submission.github_branch.isnot(None),
                )
                .order_by(Submission.created_at.desc())
            )
        ref = sub_row.github_branch if sub_row and sub_row.github_branch else target_version

        # 7. Token GitHub du propriétaire du plugin
        async with db.session() as session:
            gh_token_row = await session.scalar(
                select(DeveloperGitHubToken).where(
                    DeveloperGitHubToken.user_id == plugin.developer_id
                )
            )
        github_token = gh_token_row.access_token if gh_token_row else None

        # 7bis. Vérifier que le ref résolu est bien un tag Git existant (déploiement forcé sur tag)
        if not await _verify_tag(repo_owner, repo_name, ref, github_token):
            raise HTTPException(
                status_code=400,
                detail=f"La version '{target_version}' ne correspond à aucun tag Git existant "
                f"sur {repo_owner}/{repo_name} (ref='{ref}'). Le déploiement doit être fait "
                "depuis un tag Git.",
            )

        # 8. Télécharger le ZIP
        logger.info("[install] %s@%s ← %s/%s@%s", slug, target_version, repo_owner, repo_name, ref)
        zip_data = await _download_zip(repo_owner, repo_name, ref, github_token)

        # 9. Signer avec la clé HMAC de l'utilisateur (CLI user)
        secret = await _get_signing_secret(user_id, db, master_key)
        signature = _sign_zip(zip_data, secret)

        logger.info("[install] %s@%s signé — %d octets", slug, target_version, len(zip_data))

        # 10. Incrémenter le compteur de téléchargements — jusqu'ici seul
        # GET /plugins/{slug} (une vue de détail publique) l'incrémentait ;
        # ce endpoint-ci est le vrai "quelqu'un a installé ce plugin" (via
        # xcore-agent), et ne le touchait pas du tout.
        async with db.session() as session:
            fresh = await session.get(Plugin, plugin.id)
            if fresh is not None:
                fresh.download_count = (fresh.download_count or 0) + 1
                await session.commit()

        return Response(
            content=zip_data,
            media_type="application/zip",
            headers={
                "X-Signature": f"hmac_sha256:{signature}",
                "X-Plugin": f"{plugin.name}@{target_version}",
                "X-Repo": f"{repo_owner}/{repo_name}@{ref}",
                "Content-Disposition": f'attachment; filename="{slug}-{target_version}.zip"',
            },
        )

    return router
