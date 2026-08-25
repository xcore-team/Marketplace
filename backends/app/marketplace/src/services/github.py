from __future__ import annotations

import base64
import logging
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.github import DeveloperGitHubToken

logger = logging.getLogger("hub.marketplace.github")

# Slots de documentation récupérés depuis le repo GitHub (candidats par ordre de priorité)
DOC_FILE_CANDIDATES: Dict[str, List[str]] = {
    "readme": ["README.md", "readme.md", "Readme.md"],
    "integration": ["integration.yaml", "integration.yml", "integration.md", "INTEGRATION.md"],
    "contributor": ["CONTRIBUTING.md", "CONTRIBUTING", "contributor.yaml", "contributors.yaml"],
}


class GitHubService:
    def __init__(self, session: AsyncSession):
        self._s = session

    async def link_account(
        self,
        user_id: str,
        access_token: str,
        scopes: Optional[str] = None,
    ) -> DeveloperGitHubToken:
        info = await self._fetch_user(access_token)

        existing = await self._s.scalar(
            select(DeveloperGitHubToken).where(DeveloperGitHubToken.user_id == user_id)
        )
        if existing:
            existing.access_token = access_token
            existing.github_login = info["login"]
            existing.scopes = scopes
            await self._s.flush()
            return existing

        token = DeveloperGitHubToken(
            user_id=user_id,
            github_login=info["login"],
            github_user_id=str(info["id"]),
            access_token=access_token,
            scopes=scopes,
        )
        self._s.add(token)
        await self._s.flush()
        return token

    async def get_linked(self, user_id: str) -> Optional[DeveloperGitHubToken]:
        return await self._s.scalar(
            select(DeveloperGitHubToken).where(DeveloperGitHubToken.user_id == user_id)
        )

    async def download_repo_zip(
        self,
        user_id: str,
        repo_owner: str,
        repo_name: str,
        ref: str = "main",
        dest_dir: Optional[Path] = None,
    ) -> Path:
        record = await self.get_linked(user_id)
        if record is None:
            raise ValueError("Aucun compte GitHub lié. Utilisez POST /github/link d'abord.")

        url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/zipball/{ref}"
        logger.info(f"[github] Téléchargement {repo_owner}/{repo_name}@{ref}")

        async with httpx.AsyncClient(follow_redirects=True, timeout=60) as client:
            resp = await client.get(
                url,
                headers={
                    "Authorization": f"Bearer {record.access_token}",
                    "Accept": "application/vnd.github+json",
                },
            )

        if resp.status_code == 404:
            raise ValueError(f"Repo '{repo_owner}/{repo_name}' introuvable ou accès refusé.")
        if resp.status_code == 401:
            raise ValueError("Token GitHub invalide ou expiré. Reliez votre compte GitHub.")
        resp.raise_for_status()

        base = dest_dir if dest_dir is not None else Path(tempfile.mkdtemp())
        base.mkdir(parents=True, exist_ok=True)
        zip_path = base / f"{user_id}_{repo_name}-{ref}-{uuid4().hex[:8]}.zip"
        zip_path.write_bytes(resp.content)
        logger.info(f"[github] ZIP → {zip_path} ({len(resp.content) // 1024} KB)")
        return zip_path

    async def list_tags(
        self,
        user_id: str,
        repo_owner: str,
        repo_name: str,
        max_pages: int = 3,
    ) -> List[Dict[str, str]]:
        """Liste les tags Git d'un repo (jusqu'à 3 pages de 100 = 300 tags)."""
        record = await self.get_linked(user_id)
        if record is None:
            raise ValueError("Aucun compte GitHub lié. Utilisez POST /github/link d'abord.")

        headers = {
            "Authorization": f"Bearer {record.access_token}",
            "Accept": "application/vnd.github+json",
        }
        tags: List[Dict[str, str]] = []
        async with httpx.AsyncClient(timeout=15) as client:
            for page in range(1, max_pages + 1):
                resp = await client.get(
                    f"https://api.github.com/repos/{repo_owner}/{repo_name}/tags",
                    headers=headers,
                    params={"per_page": 100, "page": page},
                )
                if resp.status_code == 401:
                    raise ValueError("Token GitHub invalide ou expiré. Reliez votre compte GitHub.")
                if resp.status_code == 404:
                    raise ValueError(f"Repo '{repo_owner}/{repo_name}' introuvable ou accès refusé.")
                resp.raise_for_status()
                batch = resp.json()
                tags.extend({"name": t["name"], "sha": t["commit"]["sha"]} for t in batch)
                if len(batch) < 100:
                    break
        return tags

    async def get_tag(
        self,
        user_id: str,
        repo_owner: str,
        repo_name: str,
        tag: str,
    ) -> Optional[Dict[str, str]]:
        """Retourne le tag {name, sha} s'il existe sur le repo, sinon None."""
        for t in await self.list_tags(user_id, repo_owner, repo_name):
            if t["name"] == tag:
                return t
        return None

    async def get_file_content(
        self,
        user_id: str,
        repo_owner: str,
        repo_name: str,
        path: str,
        ref: str,
    ) -> Optional[str]:
        """Récupère le contenu texte d'un fichier du repo à un ref donné (Contents API)."""
        record = await self.get_linked(user_id)
        if record is None:
            raise ValueError("Aucun compte GitHub lié. Utilisez POST /github/link d'abord.")

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{repo_owner}/{repo_name}/contents/{path}",
                headers={
                    "Authorization": f"Bearer {record.access_token}",
                    "Accept": "application/vnd.github+json",
                },
                params={"ref": ref},
            )
        if resp.status_code == 404:
            return None
        if resp.status_code == 401:
            raise ValueError("Token GitHub invalide ou expiré. Reliez votre compte GitHub.")
        resp.raise_for_status()
        data = resp.json()
        if data.get("encoding") != "base64" or "content" not in data:
            return None
        return base64.b64decode(data["content"]).decode("utf-8", errors="replace")

    async def fetch_docs(
        self,
        user_id: str,
        repo_owner: str,
        repo_name: str,
        ref: str,
    ) -> Dict[str, Optional[str]]:
        """Récupère README / integration / contributor depuis le repo au ref donné (tag publié)."""
        docs: Dict[str, Optional[str]] = {}
        for slot, candidates in DOC_FILE_CANDIDATES.items():
            content: Optional[str] = None
            for candidate in candidates:
                try:
                    content = await self.get_file_content(
                        user_id, repo_owner, repo_name, candidate, ref
                    )
                except ValueError:
                    raise
                except Exception as exc:
                    logger.warning("[github] Lecture %s échouée : %s", candidate, exc)
                    content = None
                if content is not None:
                    break
            docs[slot] = content
        return docs

    async def list_repos(
        self,
        user_id: str,
        per_page: int = 50,
        page: int = 1,
        sort: str = "updated",
        manifest: Optional[str] = None,
    ) -> list[dict]:
        import asyncio

        record = await self.get_linked(user_id)
        if record is None:
            raise ValueError("Aucun compte GitHub lié. Utilisez POST /github/link d'abord.")

        headers = {
            "Authorization": f"Bearer {record.access_token}",
            "Accept": "application/vnd.github+json",
        }

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://api.github.com/user/repos",
                headers=headers,
                params={
                    "per_page": per_page,
                    "page": page,
                    "sort": sort,
                    "affiliation": "owner,collaborator",
                },
            )
            if resp.status_code == 401:
                raise ValueError("Token GitHub invalide ou expiré. Reliez votre compte GitHub.")
            resp.raise_for_status()

            # GitHub ne renvoie déjà que les repos accessibles avec ce token
            # (privés compris si le scope `repo` a été accordé — voir
            # xauth.oauth.linked / linkViaOAuth) — un filtre "publics
            # seulement" ici ignorait délibérément les repos privés même
            # avec le bon scope, rendant invisibles les plugins XCore hébergés
            # en privé alors que le but même du scope `repo` (vs `public_repo`
            # côté GitHub) est justement de les inclure.
            repos = resp.json()

            # Filter by manifest file existence (parallel HEAD requests)
            if manifest and repos:
                async def _has_file(full_name: str) -> bool:
                    try:
                        r = await client.head(
                            f"https://api.github.com/repos/{full_name}/contents/{manifest}",
                            headers=headers,
                        )
                        return r.status_code == 200
                    except Exception:
                        return False

                results = await asyncio.gather(*[_has_file(r["full_name"]) for r in repos])
                repos = [r for r, ok in zip(repos, results) if ok]

        return [
            {
                "id": r["id"],
                "name": r["name"],
                "full_name": r["full_name"],
                "description": r.get("description"),
                "private": r["private"],
                "default_branch": r["default_branch"],
                "language": r.get("language"),
                "stargazers_count": r["stargazers_count"],
                "updated_at": r["updated_at"],
                "html_url": r["html_url"],
            }
            for r in repos
        ]

    async def _fetch_user(self, access_token: str) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github+json",
                },
            )
            resp.raise_for_status()
            return resp.json()


# ── Réaction à xauth.oauth.linked ────────────────────────────────────────────
#
# xauth émet cet événement (bus in-process, voir app/auth/src/routes/oauth.py)
# quand un utilisateur déjà connecté vient de lier un provider avec des scopes
# étendus (ex. "repo") via /oauth/{provider}/authorize?extra_scopes=repo. Sans
# ça, l'utilisateur devait recoller manuellement un Personal Access Token dans
# Atelier alors même que xauth venait de récupérer un token GitHub valide —
# deux comptes GitHub totalement séparés (xauth.OAuthAccount pour la
# connexion, marketplace.DeveloperGitHubToken pour parcourir/publier des
# repos), voir le fil de discussion. Ne fait rien pour un login/link
# classique (provider != github ou scope repo absent) — payload sans "repo"
# dans `scopes` ne déclenche jamais d'écriture ici.
async def handle_oauth_linked(db: Any, event: Any) -> None:
    data = getattr(event, "data", None) or {}
    if data.get("provider") != "github":
        return
    # GitHub renvoie le champ `scope` de la réponse token séparé par des
    # virgules ("repo,read:user,user:email"), pas par des espaces comme la
    # plupart des autres providers — un .split() nu ratait "repo" à coup sûr.
    scopes = (data.get("scopes") or "").replace(",", " ").split()
    if "repo" not in scopes:
        return
    user_id = data.get("user_id")
    access_token = data.get("access_token")
    if not user_id or not access_token:
        return

    async with db.session() as session:
        try:
            await GitHubService(session).link_account(
                user_id=user_id,
                access_token=access_token,
                scopes=data.get("scopes"),
            )
            await session.commit()
            logger.info("[github] Compte lié via xauth.oauth.linked (user_id=%s)", user_id)
        except Exception:
            logger.exception(
                "[github] Échec de la liaison auto depuis xauth.oauth.linked (user_id=%s)",
                user_id,
            )
