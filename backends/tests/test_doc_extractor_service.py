"""Tests unitaires — DocExtractorService (SQLite en mémoire).

Le service persiste des contenus déjà récupérés (via GitHubService.fetch_docs) ;
il n'extrait plus de ZIP.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.xdocs.src.models.base import Base as DocsBase
from app.xdocs.src.services.extractor import DocExtractorService


@pytest_asyncio.fixture()
async def docs_engine():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(DocsBase.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture()
async def docs_session(docs_engine):
    factory = async_sessionmaker(docs_engine, expire_on_commit=False)
    async with factory() as s:
        yield s


@pytest.mark.asyncio
async def test_save_docs_creates_new_record(docs_session):
    svc = DocExtractorService(docs_session)
    doc = await svc.save_docs(
        plugin_id="plugin-1",
        version="1.0.0",
        readme="# Hello",
        integration="services: {}",
        contributor="maintainers:\n  - name: Alice",
    )
    await docs_session.flush()

    assert doc.readme == "# Hello"
    assert doc.integration == "services: {}"
    assert doc.contributor == {"maintainers": [{"name": "Alice"}]}


@pytest.mark.asyncio
async def test_save_docs_upserts_existing_version(docs_session):
    svc = DocExtractorService(docs_session)
    await svc.save_docs(
        plugin_id="plugin-1", version="1.0.0", readme="old", integration=None, contributor=None
    )
    await docs_session.flush()

    updated = await svc.save_docs(
        plugin_id="plugin-1", version="1.0.0", readme="new", integration=None, contributor=None
    )
    await docs_session.flush()

    assert updated.readme == "new"
    fetched = await svc.get("plugin-1", "1.0.0")
    assert fetched.readme == "new"


@pytest.mark.asyncio
async def test_save_docs_with_none_contributor(docs_session):
    svc = DocExtractorService(docs_session)
    doc = await svc.save_docs(
        plugin_id="plugin-1", version="1.0.0", readme=None, integration=None, contributor=None
    )
    await docs_session.flush()

    assert doc.contributor is None


@pytest.mark.asyncio
async def test_save_docs_contributor_markdown_wrapped_as_raw(docs_session):
    svc = DocExtractorService(docs_session)
    doc = await svc.save_docs(
        plugin_id="plugin-1",
        version="1.0.0",
        readme=None,
        integration=None,
        contributor="# Contributing\n\nPlease open a PR.",
    )
    await docs_session.flush()

    assert doc.contributor is not None
    assert "raw" in doc.contributor or "data" in doc.contributor


@pytest.mark.asyncio
async def test_get_latest_returns_most_recently_extracted(docs_session):
    svc = DocExtractorService(docs_session)
    await svc.save_docs(
        plugin_id="plugin-1", version="1.0.0", readme="v1", integration=None, contributor=None
    )
    await docs_session.flush()
    await svc.save_docs(
        plugin_id="plugin-1", version="2.0.0", readme="v2", integration=None, contributor=None
    )
    await docs_session.flush()

    latest = await svc.get_latest("plugin-1")
    assert latest.version == "2.0.0"
    assert latest.readme == "v2"
