"""Fixtures partagées — moteur SQLite en mémoire pour tous les tests."""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.marketplace.src.models.base import Base as MarketBase
from app.marketplace.src.models.plugin import (  # noqa: F401
    Category,
    Plugin,
    PluginVersion,
)

from .http_utils import FakeDb


@pytest_asyncio.fixture()
async def engine():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(MarketBase.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture()
async def session(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as s:
        yield s


# ── Harnais HTTP (FastAPI TestClient-style, via httpx.ASGITransport) ──────────
# Fixtures partagées par tests/test_http_*.py — voir http_utils.py pour les
# classes/fonctions non-fixtures (FakeDb, FakeAuthBackend, auth_header, ...).
# `xcore` n'est importé qu'à l'intérieur de fake_auth (lazy) : les tests
# service-layer (la majorité) n'en ont pas besoin et tournent dans un
# environnement plus léger qui ne l'a pas installé.


@pytest.fixture()
def fake_auth():
    from xcore.kernel.api.auth import register_auth_backend, unregister_auth_backend

    from .http_utils import FakeAuthBackend

    backend = FakeAuthBackend()
    register_auth_backend(backend)
    yield backend
    unregister_auth_backend()


@pytest_asyncio.fixture()
async def http_engine():
    """Un moteur SQLite en mémoire partagé avec les tables de toutes les apps —
    les routes de cette session traversent les frontières d'app en SQL brut
    (xadmin -> market_plugins, le check d'accès xorgs -> org_members, ...),
    donc un seul moteur partagé reflète comment elles tournent réellement
    en production contre une seule base physique."""
    from sqlalchemy import text

    from app.marketplace.src.models.base import Base as MarketBase
    from app.xdeployments.src.models.base import Base as DeploymentsBase
    from app.xdocs.src.models.base import Base as DocsBase
    from app.xorgs.src.models.base import Base as OrgBase
    from app.xservices.src.models.base import Base as SvcBase

    eng = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with eng.begin() as conn:
        for base in (MarketBase, OrgBase, DeploymentsBase, DocsBase, SvcBase):
            await conn.run_sync(base.metadata.create_all)
        await conn.execute(text("""
            CREATE TABLE devkeys_api_keys (
                key_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                last_used_at TEXT
            )
        """))
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture()
async def http_db(http_engine):
    return FakeDb(http_engine)
