"""Tests unitaires — OrganizationService (SQLite en mémoire)."""
from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.xorgs.src.models.base import Base as OrgBase
from app.xorgs.src.services.organization import OrganizationService


@pytest_asyncio.fixture()
async def org_engine():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(OrgBase.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture()
async def org_session(org_engine):
    factory = async_sessionmaker(org_engine, expire_on_commit=False)
    async with factory() as s:
        yield s


@pytest.mark.asyncio
async def test_create_organization_makes_creator_owner(org_session):
    svc = OrganizationService(org_session)
    org = await svc.create(owner_id="dev-1", name="Acme Corp")
    await org_session.flush()

    assert org.slug == "acme-corp"
    member = await svc.get_membership(org.id, "dev-1")
    assert member is not None
    assert member.role == "owner"


@pytest.mark.asyncio
async def test_create_organization_duplicate_slug_raises(org_session):
    svc = OrganizationService(org_session)
    await svc.create(owner_id="dev-1", name="Acme Corp")
    await org_session.flush()

    with pytest.raises(ValueError, match="slug"):
        await svc.create(owner_id="dev-2", name="acme corp")


@pytest.mark.asyncio
async def test_invite_and_accept_flow(org_session):
    svc = OrganizationService(org_session)
    org = await svc.create(owner_id="owner-1", name="Team X")
    await org_session.flush()

    invitation = await svc.invite(
        organization_id=org.id, invited_by="owner-1", email="Dev2@Example.com", role="member"
    )
    await org_session.flush()
    assert invitation.status == "pending"
    assert invitation.invited_email == "dev2@example.com"  # normalisée

    member = await svc.accept_invitation(invitation, user_id="dev-2", user_email="dev2@example.com")
    await org_session.flush()

    assert member.role == "member"
    assert invitation.status == "accepted"

    members = await svc.list_members(org.id)
    assert {m.user_id for m in members} == {"owner-1", "dev-2"}


@pytest.mark.asyncio
async def test_accept_invitation_wrong_email_raises_permission_error(org_session):
    svc = OrganizationService(org_session)
    org = await svc.create(owner_id="owner-1", name="Team Y")
    await org_session.flush()
    invitation = await svc.invite(organization_id=org.id, invited_by="owner-1", email="a@example.com")
    await org_session.flush()

    with pytest.raises(PermissionError):
        await svc.accept_invitation(invitation, user_id="dev-2", user_email="b@example.com")


@pytest.mark.asyncio
async def test_invite_cannot_grant_owner_role(org_session):
    svc = OrganizationService(org_session)
    org = await svc.create(owner_id="owner-1", name="Team Z")
    await org_session.flush()

    with pytest.raises(ValueError):
        await svc.invite(organization_id=org.id, invited_by="owner-1", email="a@example.com", role="owner")


@pytest.mark.asyncio
async def test_accept_already_declined_invitation_raises(org_session):
    svc = OrganizationService(org_session)
    org = await svc.create(owner_id="owner-1", name="Team D")
    await org_session.flush()
    invitation = await svc.invite(organization_id=org.id, invited_by="owner-1", email="a@example.com")
    await org_session.flush()

    await svc.decline_invitation(invitation)
    await org_session.flush()
    assert invitation.status == "declined"

    with pytest.raises(ValueError):
        await svc.accept_invitation(invitation, user_id="dev-2", user_email="a@example.com")


@pytest.mark.asyncio
async def test_remove_last_owner_raises(org_session):
    svc = OrganizationService(org_session)
    org = await svc.create(owner_id="owner-1", name="Solo Org")
    await org_session.flush()

    with pytest.raises(ValueError, match="dernier owner"):
        await svc.remove_member(org.id, "owner-1")


@pytest.mark.asyncio
async def test_remove_member_ok(org_session):
    svc = OrganizationService(org_session)
    org = await svc.create(owner_id="owner-1", name="Multi Org")
    await org_session.flush()
    invitation = await svc.invite(organization_id=org.id, invited_by="owner-1", email="a@example.com")
    await org_session.flush()
    await svc.accept_invitation(invitation, user_id="dev-2", user_email="a@example.com")
    await org_session.flush()

    removed = await svc.remove_member(org.id, "dev-2")
    await org_session.flush()
    assert removed is True
    assert await svc.get_membership(org.id, "dev-2") is None


@pytest.mark.asyncio
async def test_set_role_invalid_raises(org_session):
    svc = OrganizationService(org_session)
    org = await svc.create(owner_id="owner-1", name="Role Org")
    await org_session.flush()

    with pytest.raises(ValueError, match="Rôle invalide"):
        await svc.set_role(org.id, "owner-1", "superadmin")


@pytest.mark.asyncio
async def test_has_at_least_role_ranking(org_session):
    svc = OrganizationService(org_session)
    org = await svc.create(owner_id="owner-1", name="Rank Org")
    await org_session.flush()
    owner_member = await svc.get_membership(org.id, "owner-1")

    assert svc.has_at_least(owner_member, "member") is True
    assert svc.has_at_least(owner_member, "admin") is True
    assert svc.has_at_least(owner_member, "owner") is True
    assert svc.has_at_least(None, "member") is False


@pytest.mark.asyncio
async def test_org_ids_for_user(org_session):
    svc = OrganizationService(org_session)
    org_a = await svc.create(owner_id="dev-1", name="Org A")
    await org_session.flush()
    org_b = await svc.create(owner_id="dev-2", name="Org B")
    await org_session.flush()
    invitation = await svc.invite(organization_id=org_b.id, invited_by="dev-2", email="dev1@example.com")
    await org_session.flush()
    await svc.accept_invitation(invitation, user_id="dev-1", user_email="dev1@example.com")
    await org_session.flush()

    ids = await svc.org_ids_for_user("dev-1")
    assert ids == {org_a.id, org_b.id}
    assert await svc.org_ids_for_user("nobody") == set()


@pytest.mark.asyncio
async def test_can_access_private_owner_org_member_and_stranger(org_session):
    svc = OrganizationService(org_session)
    org = await svc.create(owner_id="owner-1", name="Access Org")
    await org_session.flush()
    invitation = await svc.invite(organization_id=org.id, invited_by="owner-1", email="member@example.com")
    await org_session.flush()
    await svc.accept_invitation(invitation, user_id="member-1", user_email="member@example.com")
    await org_session.flush()

    # Propriétaire direct — pas d'organisation
    assert await svc.can_access_private("dev-1", None, "dev-1") is True
    # Un autre utilisateur, pas d'organisation
    assert await svc.can_access_private("dev-1", None, "dev-2") is False
    # Membre de l'organisation propriétaire
    assert await svc.can_access_private("owner-1", org.id, "member-1") is True
    # Non-membre de l'organisation propriétaire
    assert await svc.can_access_private("owner-1", org.id, "stranger") is False
    # Aucun viewer (accès anonyme)
    assert await svc.can_access_private("owner-1", org.id, None) is False
