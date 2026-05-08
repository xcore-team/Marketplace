from __future__ import annotations

import logging
import tempfile
from pathlib import Path
from typing import Optional
from uuid import uuid4

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.github import DeveloperGitHubToken

logger = logging.getLogger("hub.marketplace.github")


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
        branch: str = "main",
        dest_dir: Optional[Path] = None,
    ) -> Path:
        record = await self.get_linked(user_id)
        if record is None:
            raise ValueError("Aucun compte GitHub lié. Utilisez POST /github/link d'abord.")

        url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/zipball/{branch}"
        logger.info(f"[github] Téléchargement {repo_owner}/{repo_name}@{branch}")

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
        zip_path = base / f"{user_id}_{repo_name}-{branch}-{uuid4().hex[:8]}.zip"
        zip_path.write_bytes(resp.content)
        logger.info(f"[github] ZIP → {zip_path} ({len(resp.content) // 1024} KB)")
        return zip_path

    async def list_repos(
        self,
        user_id: str,
        per_page: int = 50,
        page: int = 1,
        sort: str = "updated",
    ) -> list[dict]:
        record = await self.get_linked(user_id)
        if record is None:
            raise ValueError("Aucun compte GitHub lié. Utilisez POST /github/link d'abord.")

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                "https://api.github.com/user/repos",
                headers={
                    "Authorization": f"Bearer {record.access_token}",
                    "Accept": "application/vnd.github+json",
                },
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
            for r in resp.json()
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
