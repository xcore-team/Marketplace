"""Tests unitaires — visibilité public/private et organization_id sur PluginService."""
from __future__ import annotations

import pytest

from app.marketplace.src.services.plugin import PluginService


@pytest.mark.asyncio
async def test_create_invalid_visibility_raises(session):
    svc = PluginService(session)
    with pytest.raises(ValueError, match="visibility"):
        await svc.create(developer_id="dev-1", name="Bad Plugin", visibility="secret")


@pytest.mark.asyncio
async def test_create_private_plugin_with_org(session):
    svc = PluginService(session)
    plugin = await svc.create(
        developer_id="dev-1", name="Org Plugin", visibility="private", organization_id="org-1"
    )
    await session.flush()
    assert plugin.visibility == "private"
    assert plugin.organization_id == "org-1"


@pytest.mark.asyncio
async def test_can_view_public_plugin_by_anyone(session):
    svc = PluginService(session)
    plugin = await svc.create(developer_id="dev-1", name="Public Plugin")
    await session.flush()

    assert await svc.can_view(plugin, viewer_id=None) is True
    assert await svc.can_view(plugin, viewer_id="stranger") is True


@pytest.mark.asyncio
async def test_can_view_private_plugin_owner_org_and_stranger(session):
    svc = PluginService(session)
    plugin = await svc.create(
        developer_id="dev-1", name="Private Plugin", visibility="private", organization_id="org-1"
    )
    await session.flush()

    assert await svc.can_view(plugin, viewer_id="dev-1") is True
    assert await svc.can_view(plugin, viewer_id=None) is False
    assert await svc.can_view(plugin, viewer_id="stranger", viewer_org_ids=set()) is False
    assert await svc.can_view(plugin, viewer_id="colleague", viewer_org_ids={"org-1"}) is True
    assert await svc.can_view(plugin, viewer_id="colleague", viewer_org_ids={"org-2"}) is False


@pytest.mark.asyncio
async def test_list_published_excludes_private_for_stranger(session):
    svc = PluginService(session)
    pub = await svc.create(developer_id="dev-1", name="Pub One")
    await session.flush()
    pub.is_published = True
    priv = await svc.create(developer_id="dev-1", name="Priv One", visibility="private")
    await session.flush()
    priv.is_published = True
    await session.flush()

    items = await svc.list_published()
    names = {p.name for p in items}
    assert names == {"Pub One"}

    items_as_owner = await svc.list_published(viewer_id="dev-1")
    names_as_owner = {p.name for p in items_as_owner}
    assert names_as_owner == {"Pub One", "Priv One"}


@pytest.mark.asyncio
async def test_list_published_includes_private_for_org_member(session):
    svc = PluginService(session)
    priv = await svc.create(
        developer_id="dev-1", name="Team Plugin", visibility="private", organization_id="org-1"
    )
    await session.flush()
    priv.is_published = True
    await session.flush()

    assert await svc.list_published() == []
    items = await svc.list_published(viewer_id="colleague", viewer_org_ids={"org-1"})
    assert [p.name for p in items] == ["Team Plugin"]


@pytest.mark.asyncio
async def test_count_published_respects_visibility(session):
    svc = PluginService(session)
    for i in range(2):
        p = await svc.create(developer_id="dev-1", name=f"Pub {i}")
        await session.flush()
        p.is_published = True
    priv = await svc.create(developer_id="dev-1", name="Priv", visibility="private")
    await session.flush()
    priv.is_published = True
    await session.flush()

    assert await svc.count_published() == 2
    assert await svc.count_published(viewer_id="dev-1") == 3
