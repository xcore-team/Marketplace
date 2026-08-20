"""Tests unitaires — PluginService (SQLite en mémoire)."""
from __future__ import annotations

import pytest
import pytest_asyncio

from app.marketplace.src.services.plugin import PluginService


@pytest.mark.asyncio
async def test_create_plugin_ok(session):
    svc = PluginService(session)
    plugin = await svc.create(
        developer_id="dev-1",
        name="My Plugin",
        description="Une belle description",
    )
    await session.flush()
    assert plugin.id is not None
    assert plugin.slug == "my-plugin"
    assert plugin.developer_id == "dev-1"
    assert plugin.is_published is False


@pytest.mark.asyncio
async def test_create_plugin_duplicate_slug_raises(session):
    svc = PluginService(session)
    await svc.create(developer_id="dev-1", name="My Plugin")
    await session.flush()

    with pytest.raises(ValueError, match="slug"):
        await svc.create(developer_id="dev-2", name="my plugin")  # même slug


@pytest.mark.asyncio
async def test_get_by_slug(session):
    svc = PluginService(session)
    await svc.create(developer_id="dev-1", name="Cool Tool")
    await session.flush()

    found = await svc.get_by_slug("cool-tool")
    assert found is not None
    assert found.name == "Cool Tool"


@pytest.mark.asyncio
async def test_get_by_slug_missing_returns_none(session):
    svc = PluginService(session)
    assert await svc.get_by_slug("nonexistent") is None


@pytest.mark.asyncio
async def test_count_published_empty(session):
    svc = PluginService(session)
    assert await svc.count_published() == 0


@pytest.mark.asyncio
async def test_count_published_after_publish(session):
    svc = PluginService(session)
    plugin = await svc.create(developer_id="dev-1", name="Published Plugin")
    await session.flush()

    plugin.is_published = True
    await session.flush()

    assert await svc.count_published() == 1


@pytest.mark.asyncio
async def test_list_published_pagination(session):
    svc = PluginService(session)
    for i in range(5):
        p = await svc.create(developer_id="dev-1", name=f"Plugin {i}")
        await session.flush()
        p.is_published = True
        await session.flush()

    page1 = await svc.list_published(limit=3, offset=0)
    page2 = await svc.list_published(limit=3, offset=3)

    assert len(page1) == 3
    assert len(page2) == 2
    # Aucun doublon entre les deux pages
    ids1 = {p.id for p in page1}
    ids2 = {p.id for p in page2}
    assert ids1.isdisjoint(ids2)


@pytest.mark.asyncio
async def test_list_by_developer(session):
    svc = PluginService(session)
    await svc.create(developer_id="dev-A", name="Plugin A1")
    await session.flush()
    await svc.create(developer_id="dev-A", name="Plugin A2")
    await session.flush()
    await svc.create(developer_id="dev-B", name="Plugin B1")
    await session.flush()

    result = await svc.list_by_developer("dev-A")
    assert len(result) == 2
    assert all(p.developer_id == "dev-A" for p in result)


@pytest.mark.asyncio
async def test_add_version_auto_published(session):
    svc = PluginService(session)
    plugin = await svc.create(developer_id="dev-1", name="Safe Plugin")
    await session.flush()

    pv = await svc.add_version(
        plugin=plugin,
        version="1.0.0",
        anomaly_score=10,  # ≤ SCORE_AUTO_PUBLISH (30) → auto_published
        is_stable=True,
    )
    await session.flush()

    assert pv.publish_status == "auto_published"
    assert plugin.is_published is True


@pytest.mark.asyncio
async def test_add_version_manual_review(session):
    svc = PluginService(session)
    plugin = await svc.create(developer_id="dev-1", name="Risky Plugin")
    await session.flush()

    pv = await svc.add_version(plugin=plugin, version="1.0.0", anomaly_score=50)
    await session.flush()

    assert pv.publish_status == "manual_review"
    assert plugin.is_published is True  # visible mais sous revue


@pytest.mark.asyncio
async def test_add_version_rejected(session):
    svc = PluginService(session)
    plugin = await svc.create(developer_id="dev-1", name="Malicious Plugin")
    await session.flush()

    pv = await svc.add_version(plugin=plugin, version="1.0.0", anomaly_score=90)
    await session.flush()

    assert pv.publish_status == "rejected"
    assert plugin.is_published is False


@pytest.mark.asyncio
async def test_yank_version(session):
    svc = PluginService(session)
    plugin = await svc.create(developer_id="dev-1", name="Plugin To Yank")
    await session.flush()
    await svc.add_version(plugin=plugin, version="1.0.0", anomaly_score=5)
    await session.flush()

    yanked = await svc.yank_version(plugin.id, "1.0.0", reason="faille de sécurité")
    await session.flush()

    assert yanked is not None
    assert yanked.is_yanked is True
    assert yanked.publish_status == "yanked"
    assert "sécurité" in (yanked.yanked_reason or "")


@pytest.mark.asyncio
async def test_yank_nonexistent_version_returns_none(session):
    svc = PluginService(session)
    plugin = await svc.create(developer_id="dev-1", name="Plugin X")
    await session.flush()

    result = await svc.yank_version(plugin.id, "99.0.0")
    assert result is None
