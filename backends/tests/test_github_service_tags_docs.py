"""Tests unitaires — GitHubService.list_tags / get_tag / get_file_content / fetch_docs.

httpx est mocké : ces tests ne font aucun appel réseau réel vers l'API GitHub.
"""
from __future__ import annotations

import base64
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.marketplace.src.models.base import Base as MarketBase
from app.marketplace.src.models.github import DeveloperGitHubToken
from app.marketplace.src.services.github import GitHubService


@pytest_asyncio.fixture()
async def gh_engine():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(MarketBase.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture()
async def gh_session(gh_engine):
    factory = async_sessionmaker(gh_engine, expire_on_commit=False)
    async with factory() as s:
        yield s


@pytest_asyncio.fixture()
async def linked_session(gh_session):
    gh_session.add(
        DeveloperGitHubToken(
            user_id="dev-1",
            github_login="dev1",
            github_user_id="123",
            access_token="gh-token-abc",
        )
    )
    await gh_session.flush()
    return gh_session


class _FakeResponse:
    def __init__(self, status_code: int, json_data=None):
        self.status_code = status_code
        self._json = json_data

    def json(self):
        return self._json

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def _mock_client(get_side_effect):
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=get_side_effect)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    return mock_client


@pytest.mark.asyncio
async def test_list_tags_single_page(linked_session):
    tags_page = [{"name": "1.0.0", "commit": {"sha": "abc123"}}]

    async def fake_get(url, headers=None, params=None):
        return _FakeResponse(200, tags_page)

    with patch("httpx.AsyncClient", return_value=_mock_client(fake_get)):
        result = await GitHubService(linked_session).list_tags("dev-1", "owner", "repo")

    assert result == [{"name": "1.0.0", "sha": "abc123"}]


@pytest.mark.asyncio
async def test_get_tag_found_and_missing(linked_session):
    tags_page = [{"name": "1.0.0", "commit": {"sha": "abc123"}}]

    async def fake_get(url, headers=None, params=None):
        return _FakeResponse(200, tags_page)

    svc = GitHubService(linked_session)
    with patch("httpx.AsyncClient", return_value=_mock_client(fake_get)):
        found = await svc.get_tag("dev-1", "owner", "repo", "1.0.0")
        missing = await svc.get_tag("dev-1", "owner", "repo", "9.9.9")

    assert found == {"name": "1.0.0", "sha": "abc123"}
    assert missing is None


@pytest.mark.asyncio
async def test_list_tags_no_linked_account_raises(gh_session):
    with pytest.raises(ValueError, match="lié"):
        await GitHubService(gh_session).list_tags("dev-unlinked", "owner", "repo")


@pytest.mark.asyncio
async def test_get_file_content_decodes_base64(linked_session):
    raw = "# Hello\nWorld"
    encoded = base64.b64encode(raw.encode()).decode()

    async def fake_get(url, headers=None, params=None):
        return _FakeResponse(200, {"encoding": "base64", "content": encoded})

    with patch("httpx.AsyncClient", return_value=_mock_client(fake_get)):
        content = await GitHubService(linked_session).get_file_content(
            "dev-1", "owner", "repo", "README.md", "1.0.0"
        )

    assert content == raw


@pytest.mark.asyncio
async def test_get_file_content_missing_returns_none(linked_session):
    async def fake_get(url, headers=None, params=None):
        return _FakeResponse(404)

    with patch("httpx.AsyncClient", return_value=_mock_client(fake_get)):
        content = await GitHubService(linked_session).get_file_content(
            "dev-1", "owner", "repo", "README.md", "1.0.0"
        )

    assert content is None


@pytest.mark.asyncio
async def test_fetch_docs_picks_first_matching_candidate(linked_session):
    readme_encoded = base64.b64encode(b"# README").decode()
    integration_encoded = base64.b64encode(b"services: {}").decode()

    async def fake_get(url, headers=None, params=None):
        if url.endswith("/contents/README.md"):
            return _FakeResponse(200, {"encoding": "base64", "content": readme_encoded})
        if url.endswith("/contents/integration.yaml"):
            return _FakeResponse(200, {"encoding": "base64", "content": integration_encoded})
        return _FakeResponse(404)

    with patch("httpx.AsyncClient", return_value=_mock_client(fake_get)):
        docs = await GitHubService(linked_session).fetch_docs("dev-1", "owner", "repo", "1.0.0")

    assert docs["readme"] == "# README"
    assert docs["integration"] == "services: {}"
    assert docs["contributor"] is None
