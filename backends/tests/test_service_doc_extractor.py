"""Tests unitaires — ServiceDocExtractorService (SQLite en mémoire).

Le service persiste des contenus déjà récupérés (via GitHubService.fetch_docs) ;
il n'extrait plus de ZIP.
"""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.xservices.src.models.base import Base as SvcDocsBase
from app.xservices.src.services.doc_extractor import ServiceDocExtractorService


@pytest_asyncio.fixture()
async def svc_docs_engine():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(SvcDocsBase.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture()
async def svc_docs_session(svc_docs_engine):
    factory = async_sessionmaker(svc_docs_engine, expire_on_commit=False)
    async with factory() as s:
        yield s


@pytest.mark.asyncio
async def test_save_docs_creates_new_record(svc_docs_session):
    svc = ServiceDocExtractorService(svc_docs_session)
    doc = await svc.save_docs(
        service_id="svc-1",
        version="1.0.0",
        readme="# Hello",
        integration="services: {}",
        contributor="maintainers:\n  - name: Alice",
    )
    await svc_docs_session.flush()

    assert doc.readme == "# Hello"
    assert doc.contributor == {"maintainers": [{"name": "Alice"}]}


@pytest.mark.asyncio
async def test_save_docs_upserts_existing_version(svc_docs_session):
    svc = ServiceDocExtractorService(svc_docs_session)
    await svc.save_docs(
        service_id="svc-1", version="1.0.0", readme="old", integration=None, contributor=None
    )
    await svc_docs_session.flush()

    updated = await svc.save_docs(
        service_id="svc-1", version="1.0.0", readme="new", integration=None, contributor=None
    )
    await svc_docs_session.flush()

    assert updated.readme == "new"
    fetched = await svc.get("svc-1", "1.0.0")
    assert fetched.readme == "new"


@pytest.mark.asyncio
async def test_get_latest_returns_most_recently_extracted(svc_docs_session):
    svc = ServiceDocExtractorService(svc_docs_session)
    await svc.save_docs(service_id="svc-1", version="1.0.0", readme="v1", integration=None, contributor=None)
    await svc_docs_session.flush()
    await svc.save_docs(service_id="svc-1", version="2.0.0", readme="v2", integration=None, contributor=None)
    await svc_docs_session.flush()

    latest = await svc.get_latest("svc-1")
    assert latest.version == "2.0.0"
