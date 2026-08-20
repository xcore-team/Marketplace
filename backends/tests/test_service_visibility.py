"""Tests unitaires — visibilité public/private et organization_id sur ServiceService."""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.xservices.src.models.base import Base as SvcBase
from app.xservices.src.services.service import ServiceService


@pytest_asyncio.fixture()
async def svc_engine():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(SvcBase.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture()
async def svc_session(svc_engine):
    factory = async_sessionmaker(svc_engine, expire_on_commit=False)
    async with factory() as s:
        yield s


@pytest.mark.asyncio
async def test_create_invalid_visibility_raises(svc_session):
    svc = ServiceService(svc_session)
    with pytest.raises(ValueError, match="visibility"):
        await svc.create(developer_id="dev-1", name="Bad Service", visibility="secret")


@pytest.mark.asyncio
async def test_can_view_private_service_owner_org_and_stranger(svc_session):
    svc = ServiceService(svc_session)
    service = await svc.create(
        developer_id="dev-1", name="Private Ext", visibility="private", organization_id="org-1"
    )
    await svc_session.flush()

    assert await svc.can_view(service, viewer_id="dev-1") is True
    assert await svc.can_view(service, viewer_id=None) is False
    assert await svc.can_view(service, viewer_id="colleague", viewer_org_ids={"org-1"}) is True
    assert await svc.can_view(service, viewer_id="colleague", viewer_org_ids={"org-2"}) is False


@pytest.mark.asyncio
async def test_list_published_excludes_private_for_stranger(svc_session):
    svc = ServiceService(svc_session)
    pub = await svc.create(developer_id="dev-1", name="Pub Ext")
    await svc_session.flush()
    pub.is_published = True
    priv = await svc.create(developer_id="dev-1", name="Priv Ext", visibility="private")
    await svc_session.flush()
    priv.is_published = True
    await svc_session.flush()

    items = await svc.list_published()
    assert {s.name for s in items} == {"Pub Ext"}

    items_owner = await svc.list_published(viewer_id="dev-1")
    assert {s.name for s in items_owner} == {"Pub Ext", "Priv Ext"}


@pytest.mark.asyncio
async def test_count_published_respects_visibility(svc_session):
    svc = ServiceService(svc_session)
    pub = await svc.create(developer_id="dev-1", name="Pub")
    await svc_session.flush()
    pub.is_published = True
    priv = await svc.create(developer_id="dev-1", name="Priv", visibility="private")
    await svc_session.flush()
    priv.is_published = True
    await svc_session.flush()

    assert await svc.count_published() == 1
    assert await svc.count_published(viewer_id="dev-1") == 2
