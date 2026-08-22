"""Tests unitaires — RatingService."""

from __future__ import annotations

import pytest

from app.marketplace.src.services.plugin import PluginService
from app.marketplace.src.services.rating import RatingService


async def _make_published_plugin(session, name="Plugin Test"):
    svc = PluginService(session)
    plugin = await svc.create(developer_id="dev-1", name=name)
    await session.flush()
    plugin.is_published = True
    await session.flush()
    return plugin


@pytest.mark.asyncio
async def test_rate_plugin(session):
    plugin = await _make_published_plugin(session)
    rsvc = RatingService(session)

    rating = await rsvc.rate(plugin=plugin, user_id="user-1", score=4, comment="Bien")
    await session.flush()

    assert rating.score == 4
    assert plugin.avg_rating == 4.0
    assert plugin.rating_count == 1


@pytest.mark.asyncio
async def test_rate_invalid_score(session):
    plugin = await _make_published_plugin(session)
    rsvc = RatingService(session)

    with pytest.raises(ValueError, match="1 et 5"):
        await rsvc.rate(plugin=plugin, user_id="user-1", score=6)


@pytest.mark.asyncio
async def test_rate_update_existing(session):
    plugin = await _make_published_plugin(session)
    rsvc = RatingService(session)

    await rsvc.rate(plugin=plugin, user_id="user-1", score=3)
    await session.flush()
    # Même utilisateur revotera → mise à jour
    await rsvc.rate(plugin=plugin, user_id="user-1", score=5, comment="Encore mieux")
    await session.flush()

    assert plugin.rating_count == 1  # toujours 1 note
    assert plugin.avg_rating == 5.0


@pytest.mark.asyncio
async def test_avg_rating_multiple_users(session):
    plugin = await _make_published_plugin(session)
    rsvc = RatingService(session)

    await rsvc.rate(plugin=plugin, user_id="u1", score=2)
    await session.flush()
    await rsvc.rate(plugin=plugin, user_id="u2", score=4)
    await session.flush()

    assert plugin.rating_count == 2
    assert plugin.avg_rating == 3.0


@pytest.mark.asyncio
async def test_get_user_rating_not_found(session):
    plugin = await _make_published_plugin(session)
    rsvc = RatingService(session)

    result = await rsvc.get_user_rating(plugin.id, "ghost-user")
    assert result is None


@pytest.mark.asyncio
async def test_list_ratings(session):
    plugin = await _make_published_plugin(session)
    rsvc = RatingService(session)

    for i, uid in enumerate(["u1", "u2", "u3"], start=1):
        await rsvc.rate(plugin=plugin, user_id=uid, score=i)
        await session.flush()

    page = await rsvc.list_ratings(plugin.id, limit=2, offset=0)

    # list_ratings retourne une enveloppe de pagination (voir docs/API.md,
    # GET /plugins/{slug}/ratings), pas une liste brute.
    assert len(page["items"]) == 2
    assert page["total"] == 3
    assert page["limit"] == 2
    assert page["offset"] == 0
    assert page["has_more"] is True
