"""HTTP-level tests — GET /plugins, GET /plugins/{slug} visibility enforcement.

Exercises the real FastAPI router (dependency injection included), not just
the service layer — the optional-auth dependency, the cross-app org-access
check, and the actual response shape/status codes.
"""

from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI

pytest.importorskip(
    "xcore",
    reason="requires the real xcore dependency (poetry install) — not the lightweight test env",
)

from app.marketplace.src.routes.plugins import plugins_router  # noqa: E402
from app.marketplace.src.services.plugin import PluginService  # noqa: E402
from app.xorgs.src.services.organization import OrganizationService  # noqa: E402

from .http_utils import FakeDb, auth_header, fake_ctx  # noqa: E402


@pytest.fixture()
def app(http_db):
    application = FastAPI()
    application.include_router(plugins_router(http_db, ctx=fake_ctx))
    return application


@pytest.fixture()
async def client(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def _seed_plugin(http_db: FakeDb, **kwargs) -> str:
    async with http_db.session() as session:
        svc = PluginService(session)
        plugin = await svc.create(**kwargs)
        plugin.is_published = True
        await session.commit()
        return plugin.slug


async def test_list_plugins_excludes_private_for_anonymous(
    app, client, http_db, fake_auth
):
    await _seed_plugin(http_db, developer_id="dev-1", name="Public One")
    await _seed_plugin(
        http_db, developer_id="dev-1", name="Private One", visibility="private"
    )

    resp = await client.get("/plugins")

    assert resp.status_code == 200
    names = {item["name"] for item in resp.json()["items"]}
    assert names == {"Public One"}


async def test_list_plugins_includes_private_for_owner(app, client, http_db, fake_auth):
    await _seed_plugin(http_db, developer_id="dev-1", name="Public One")
    await _seed_plugin(
        http_db, developer_id="dev-1", name="Private One", visibility="private"
    )
    fake_auth.register_user("tok-owner", sub="dev-1")

    resp = await client.get("/plugins", headers=auth_header("tok-owner"))

    names = {item["name"] for item in resp.json()["items"]}
    assert names == {"Public One", "Private One"}


async def test_get_plugin_private_returns_404_for_anonymous(
    app, client, http_db, fake_auth
):
    slug = await _seed_plugin(
        http_db, developer_id="dev-1", name="Secret Plugin", visibility="private"
    )

    resp = await client.get(f"/plugins/{slug}")

    assert resp.status_code == 404


async def test_get_plugin_private_returns_200_for_owner(
    app, client, http_db, fake_auth
):
    slug = await _seed_plugin(
        http_db, developer_id="dev-1", name="Secret Plugin", visibility="private"
    )
    fake_auth.register_user("tok-owner", sub="dev-1")

    resp = await client.get(f"/plugins/{slug}", headers=auth_header("tok-owner"))

    assert resp.status_code == 200
    assert resp.json()["slug"] == slug


async def test_get_plugin_private_returns_404_for_stranger(
    app, client, http_db, fake_auth
):
    slug = await _seed_plugin(
        http_db, developer_id="dev-1", name="Secret Plugin", visibility="private"
    )
    fake_auth.register_user("tok-stranger", sub="someone-else")

    resp = await client.get(f"/plugins/{slug}", headers=auth_header("tok-stranger"))

    assert resp.status_code == 404


async def test_get_plugin_private_returns_200_for_org_member(
    app, client, http_db, fake_auth
):
    async with http_db.session() as session:
        org = await OrganizationService(session).create(
            owner_id="dev-1", name="Team Org"
        )
        invitation = await OrganizationService(session).invite(
            organization_id=org.id, invited_by="dev-1", email="colleague@example.com"
        )
        await OrganizationService(session).accept_invitation(
            invitation, user_id="colleague", user_email="colleague@example.com"
        )
        await session.commit()
        organization_id = org.id

    slug = await _seed_plugin(
        http_db,
        developer_id="dev-1",
        name="Team Plugin",
        visibility="private",
        organization_id=organization_id,
    )
    fake_auth.register_user("tok-colleague", sub="colleague")

    resp = await client.get(f"/plugins/{slug}", headers=auth_header("tok-colleague"))

    assert resp.status_code == 200


async def test_create_plugin_requires_org_membership(app, client, http_db, fake_auth):
    fake_auth.register_user("tok-outsider", sub="outsider", roles=["plugins:write"])

    resp = await client.post(
        "/plugins",
        json={"name": "Sneaky Plugin", "organization_id": "org-does-not-exist"},
        headers=auth_header("tok-outsider"),
    )

    assert resp.status_code == 403
