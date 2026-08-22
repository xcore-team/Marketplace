"""Tests unitaires — DeploymentService (SQLite en mémoire)."""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.xdeployments.src.models.base import Base as DeploymentsBase
from app.xdeployments.src.services.deployment import DeploymentService


@pytest_asyncio.fixture()
async def dep_engine():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(DeploymentsBase.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture()
async def dep_session(dep_engine):
    factory = async_sessionmaker(dep_engine, expire_on_commit=False)
    async with factory() as s:
        yield s


def _now():
    return datetime.utcnow()


@pytest.mark.asyncio
async def test_report_success(dep_session):
    svc = DeploymentService(dep_session)
    started = _now()
    completed = started + timedelta(seconds=5)

    deployment = await svc.report(
        deployer_id="dev-1",
        kind="plugin",
        slug="my-plugin",
        version="1.0.0",
        status="success",
        started_at=started,
        completed_at=completed,
        host_id="vps-1",
        repo="acme/my-plugin@1.0.0",
    )
    await dep_session.flush()

    assert deployment.id is not None
    assert deployment.status == "success"
    assert deployment.host_id == "vps-1"


@pytest.mark.asyncio
async def test_report_defaults_host_id(dep_session):
    svc = DeploymentService(dep_session)
    now = _now()

    deployment = await svc.report(
        deployer_id="dev-1",
        kind="plugin",
        slug="my-plugin",
        version="1.0.0",
        status="failed",
        started_at=now,
        completed_at=now,
        error_message="tag mismatch",
    )
    await dep_session.flush()

    assert deployment.host_id == "default"
    assert deployment.error_message == "tag mismatch"


@pytest.mark.asyncio
async def test_report_invalid_kind_raises(dep_session):
    svc = DeploymentService(dep_session)
    now = _now()
    with pytest.raises(ValueError, match="kind"):
        await svc.report(
            deployer_id="dev-1",
            kind="widget",
            slug="my-plugin",
            version="1.0.0",
            status="success",
            started_at=now,
            completed_at=now,
        )


@pytest.mark.asyncio
async def test_report_invalid_status_raises(dep_session):
    svc = DeploymentService(dep_session)
    now = _now()
    with pytest.raises(ValueError, match="status"):
        await svc.report(
            deployer_id="dev-1",
            kind="plugin",
            slug="my-plugin",
            version="1.0.0",
            status="pending",
            started_at=now,
            completed_at=now,
        )


@pytest.mark.asyncio
async def test_list_for_deployer_filters_and_scopes(dep_session):
    svc = DeploymentService(dep_session)
    now = _now()
    await svc.report(
        deployer_id="dev-1", kind="plugin", slug="a", version="1.0.0",
        status="success", started_at=now, completed_at=now, host_id="vps-1",
    )
    await dep_session.flush()
    await svc.report(
        deployer_id="dev-1", kind="plugin", slug="b", version="1.0.0",
        status="failed", started_at=now, completed_at=now, host_id="vps-2",
    )
    await dep_session.flush()
    await svc.report(
        deployer_id="dev-2", kind="plugin", slug="a", version="1.0.0",
        status="success", started_at=now, completed_at=now, host_id="vps-1",
    )
    await dep_session.flush()

    all_dev1 = await svc.list_for_deployer("dev-1")
    assert {d.slug for d in all_dev1} == {"a", "b"}

    only_a = await svc.list_for_deployer("dev-1", slug="a")
    assert [d.slug for d in only_a] == ["a"]

    only_failed = await svc.list_for_deployer("dev-1", status="failed")
    assert [d.slug for d in only_failed] == ["b"]


@pytest.mark.asyncio
async def test_latest_per_host_returns_most_recent_per_host(dep_session):
    svc = DeploymentService(dep_session)
    t0 = _now()

    await svc.report(
        deployer_id="dev-1", kind="plugin", slug="a", version="1.0.0",
        status="success", started_at=t0, completed_at=t0, host_id="vps-1",
    )
    await dep_session.flush()
    await svc.report(
        deployer_id="dev-1", kind="plugin", slug="a", version="1.0.0",
        status="success", started_at=t0, completed_at=t0, host_id="vps-2",
    )
    await dep_session.flush()
    # Redéploiement échoué sur vps-1 — doit remplacer la précédente entrée dans la vue "flotte".
    await svc.report(
        deployer_id="dev-1", kind="plugin", slug="a", version="1.1.0",
        status="failed", started_at=t0, completed_at=t0, host_id="vps-1",
    )
    await dep_session.flush()

    fleet = await svc.latest_per_host("dev-1", kind="plugin", slug="a")
    by_host = {d.host_id: d for d in fleet}

    assert set(by_host) == {"vps-1", "vps-2"}
    assert by_host["vps-1"].status == "failed"
    assert by_host["vps-1"].version == "1.1.0"
    assert by_host["vps-2"].status == "success"


@pytest.mark.asyncio
async def test_latest_per_host_scoped_to_deployer_and_slug(dep_session):
    svc = DeploymentService(dep_session)
    now = _now()
    await svc.report(
        deployer_id="dev-1", kind="plugin", slug="a", version="1.0.0",
        status="success", started_at=now, completed_at=now, host_id="vps-1",
    )
    await dep_session.flush()
    await svc.report(
        deployer_id="dev-1", kind="service", slug="a", version="1.0.0",
        status="success", started_at=now, completed_at=now, host_id="vps-1",
    )
    await dep_session.flush()

    plugin_only = await svc.latest_per_host("dev-1", kind="plugin", slug="a")
    assert len(plugin_only) == 1
    assert plugin_only[0].kind == "plugin"


@pytest.mark.asyncio
async def test_purge_old_keeps_only_max_per_bucket(dep_session):
    svc = DeploymentService(dep_session)
    now = _now()
    for i in range(5):
        await svc.report(
            deployer_id="dev-1", kind="plugin", slug="a", version=f"1.{i}.0",
            status="success", started_at=now, completed_at=now, host_id="vps-1",
        )
        await dep_session.flush()

    deleted = await svc.purge_old(keep_per_bucket=2, max_age_days=9999)
    await dep_session.flush()

    assert deleted == 3
    remaining = await svc.list_for_deployer("dev-1")
    assert len(remaining) == 2
    # Les plus récentes (versions 1.3.0 et 1.4.0) doivent survivre.
    assert {d.version for d in remaining} == {"1.3.0", "1.4.0"}


@pytest.mark.asyncio
async def test_purge_old_removes_stale_rows_beyond_max_age(dep_session):
    svc = DeploymentService(dep_session)
    old = _now() - timedelta(days=200)
    recent = _now()

    await svc.report(
        deployer_id="dev-1", kind="plugin", slug="a", version="1.0.0",
        status="success", started_at=old, completed_at=old, host_id="vps-1",
    )
    await dep_session.flush()
    await svc.report(
        deployer_id="dev-1", kind="plugin", slug="a", version="1.1.0",
        status="success", started_at=recent, completed_at=recent, host_id="vps-1",
    )
    await dep_session.flush()

    # Force created_at pour la ligne "ancienne" (report() horodate created_at=now par défaut)
    old_row = (await svc.list_for_deployer("dev-1"))[-1]
    old_row.created_at = old
    await dep_session.flush()

    deleted = await svc.purge_old(keep_per_bucket=100, max_age_days=90)
    await dep_session.flush()

    assert deleted == 1
    remaining = await svc.list_for_deployer("dev-1")
    assert [d.version for d in remaining] == ["1.1.0"]


@pytest.mark.asyncio
async def test_purge_old_leaves_small_buckets_untouched(dep_session):
    svc = DeploymentService(dep_session)
    now = _now()
    await svc.report(
        deployer_id="dev-1", kind="plugin", slug="a", version="1.0.0",
        status="success", started_at=now, completed_at=now, host_id="vps-1",
    )
    await dep_session.flush()

    deleted = await svc.purge_old(keep_per_bucket=50, max_age_days=9999)
    assert deleted == 0
    assert len(await svc.list_for_deployer("dev-1")) == 1
