"""Non-fixture helpers for the HTTP-level test harness — the fixtures
themselves (`fake_auth`, `http_engine`, `http_db`) live in conftest.py so
pytest auto-discovers them without each test module needing to import (and
flake8 flagging as "redefinition") the same fixture names.

Auth is faked at the same seam the real `auth` plugin uses in production:
`xcore.kernel.api.auth.register_auth_backend` — both `get_current_user` and
`require_permission(...)` (RBACChecker) resolve every request through
`get_auth_backend()`, so registering a fake backend here exercises the exact
same code path a real JWT would, without needing a real xauth plugin loaded.

X-API-Key routes (install.py's `_resolve_api_key`) don't go through that
registry at all — they run a raw SQL SELECT against `devkeys_api_keys`
directly, so `register_api_key` inserts a row into that table instead.
"""

from __future__ import annotations

import hashlib
from contextlib import asynccontextmanager
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker


class FakeAuthBackend:
    """Tokens are opaque strings the test chooses; decode_token just looks
    them up in an in-memory dict the test populates via `register_user`."""

    def __init__(self) -> None:
        self._users: dict[str, dict] = {}

    def register_user(
        self, token: str, *, sub: str, roles: Optional[list[str]] = None
    ) -> None:
        self._users[token] = {
            "sub": sub,
            "roles": roles or [],
            "permissions": roles or [],
        }

    async def extract_token(self, request) -> Optional[str]:
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            return auth[len("Bearer ") :]  # noqa: E203
        return None

    async def decode_token(self, token: str):
        return self._users.get(token)

    async def has_permission(self, payload, permission: str) -> bool:
        return permission in payload.get("permissions", [])


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


class FakeDb:
    """Stands in for the `db` service (`get_service("db")`) every router
    factory takes — real routes only ever call `db.session()`."""

    def __init__(self, engine) -> None:
        self.engine = engine
        self._factory = async_sessionmaker(engine, expire_on_commit=False)

    @asynccontextmanager
    async def session(self):
        async with self._factory() as s:
            yield s


async def register_api_key(engine, *, raw_key: str, user_id: str) -> None:
    """Insert a row install.py's _resolve_api_key / the /deployments/report
    endpoint will find — mirrors what POST /xdevkeys/api-keys does for real."""
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO devkeys_api_keys (key_hash, user_id, is_active) VALUES (:h, :u, 1)"
            ),
            {"h": key_hash, "u": user_id},
        )


async def fake_ctx(plugin: str, action: str, payload: dict) -> Any:
    """Stands in for `self.call_plugin` (cross-plugin IPC) — routes in this
    session only ever use it to resolve a user's email via the auth app."""
    return {
        "status": "ok",
        "user": {"email": f"{payload.get('user_id', 'user')}@example.com"},
    }
