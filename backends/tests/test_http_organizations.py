"""HTTP-level tests — organizations, invitations, rate limiting."""

from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI

pytest.importorskip(
    "xcore",
    reason="requires the real xcore dependency (poetry install) — not the lightweight test env",
)

from app.xorgs.src.routes.organizations import organizations_router  # noqa: E402

from .http_utils import auth_header, fake_ctx  # noqa: E402


@pytest.fixture()
def app(http_db):
    application = FastAPI()
    application.include_router(
        organizations_router(
            http_db, ctx=fake_ctx, events=None, frontend_url="https://example.com"
        )
    )
    return application


@pytest.fixture()
async def client(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_create_organization_makes_creator_owner(client, fake_auth):
    fake_auth.register_user("tok-1", sub="dev-1")

    resp = await client.post(
        "/organizations", json={"name": "Acme Corp"}, headers=auth_header("tok-1")
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["slug"] == "acme-corp"
    assert body["my_role"] == "owner"


async def test_create_organization_requires_auth(client, fake_auth):
    resp = await client.post("/organizations", json={"name": "No Auth Org"})
    assert resp.status_code == 401


async def test_invite_returns_public_fields_without_leaking_token(client, fake_auth):
    """The invitation token is only ever delivered via email (see
    _publish_invitation_email) — InvitationOut deliberately doesn't expose it."""
    fake_auth.register_user("tok-owner", sub="owner-1")

    create_resp = await client.post(
        "/organizations", json={"name": "Team X"}, headers=auth_header("tok-owner")
    )
    org_id = create_resp.json()["id"]

    invite_resp = await client.post(
        f"/organizations/{org_id}/invitations",
        json={"email": "colleague@example.com", "role": "member"},
        headers=auth_header("tok-owner"),
    )
    assert invite_resp.status_code == 201
    body = invite_resp.json()
    assert body["invited_email"] == "colleague@example.com"
    assert body["role"] == "member"
    assert body["status"] == "pending"
    assert "token" not in body


async def test_accept_invitation_via_token_then_appears_as_member(
    client, fake_auth, http_db
):
    from app.xorgs.src.services.organization import OrganizationService

    fake_auth.register_user("tok-owner", sub="owner-1")
    fake_auth.register_user("tok-invitee", sub="colleague")

    create_resp = await client.post(
        "/organizations", json={"name": "Team X"}, headers=auth_header("tok-owner")
    )
    org_id = create_resp.json()["id"]

    invite_resp = await client.post(
        f"/organizations/{org_id}/invitations",
        json={"email": "colleague@example.com", "role": "member"},
        headers=auth_header("tok-owner"),
    )
    invitation_id = invite_resp.json()["id"]

    # The token itself only ever leaves the DB via the email that was
    # published to Redis (best-effort, not observable here) — read it
    # directly for the test, same as a real invitee reading their inbox.
    async with http_db.session() as session:
        svc = OrganizationService(session)
        invitation = await svc.get_invitation(invitation_id, org_id)
        token = invitation.token

    accept_resp = await client.post(
        f"/organizations/invitations/{token}/accept", headers=auth_header("tok-invitee")
    )
    assert accept_resp.status_code == 200
    assert accept_resp.json()["role"] == "member"

    members_resp = await client.get(
        f"/organizations/{org_id}/members", headers=auth_header("tok-invitee")
    )
    assert {m["user_id"] for m in members_resp.json()} == {"owner-1", "colleague"}


async def test_accept_invitation_wrong_email_returns_403(client, fake_auth, http_db):
    from app.xorgs.src.services.organization import OrganizationService

    fake_auth.register_user("tok-owner", sub="owner-1")
    fake_auth.register_user("tok-wrong-person", sub="wrong-person")

    create_resp = await client.post(
        "/organizations", json={"name": "Team X"}, headers=auth_header("tok-owner")
    )
    org_id = create_resp.json()["id"]
    invite_resp = await client.post(
        f"/organizations/{org_id}/invitations",
        json={"email": "colleague@example.com", "role": "member"},
        headers=auth_header("tok-owner"),
    )
    invitation_id = invite_resp.json()["id"]

    async with http_db.session() as session:
        invitation = await OrganizationService(session).get_invitation(
            invitation_id, org_id
        )
        token = invitation.token

    # fake_ctx resolves every user's email as "<sub>@example.com" — "wrong-person"
    # therefore never matches "colleague@example.com".
    resp = await client.post(
        f"/organizations/invitations/{token}/accept",
        headers=auth_header("tok-wrong-person"),
    )
    assert resp.status_code == 403


async def test_invite_forbidden_for_non_admin_member(client, fake_auth):
    fake_auth.register_user("tok-owner", sub="owner-1")
    fake_auth.register_user("tok-member", sub="member-1")

    create_resp = await client.post(
        "/organizations", json={"name": "Team Y"}, headers=auth_header("tok-owner")
    )
    org_id = create_resp.json()["id"]

    # Directly promote member-1 to "member" (not admin) by inviting+accepting.
    invite_resp = await client.post(
        f"/organizations/{org_id}/invitations",
        json={"email": "member-1@example.com", "role": "member"},
        headers=auth_header("tok-owner"),
    )
    assert invite_resp.status_code == 201

    resp = await client.post(
        f"/organizations/{org_id}/invitations",
        json={"email": "someone@example.com", "role": "member"},
        headers=auth_header("tok-member"),
    )
    assert resp.status_code == 403


async def test_invitation_rate_limit_returns_429(client, fake_auth):
    fake_auth.register_user("tok-spammer", sub="spammer")
    create_resp = await client.post(
        "/organizations",
        json={"name": "Rate Limited Org"},
        headers=auth_header("tok-spammer"),
    )
    org_id = create_resp.json()["id"]

    statuses = []
    for i in range(21):
        resp = await client.post(
            f"/organizations/{org_id}/invitations",
            json={"email": f"user{i}@example.com", "role": "member"},
            headers=auth_header("tok-spammer"),
        )
        statuses.append(resp.status_code)

    assert statuses[:20] == [201] * 20
    assert statuses[20] == 429
