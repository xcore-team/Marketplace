"""HTTP-level tests — POST /deployments/report (X-API-Key) and GET /deployments (JWT)."""

from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI

pytest.importorskip(
    "xcore",
    reason="requires the real xcore dependency (poetry install) — not the lightweight test env",
)

from app.xdeployments.src.routes.deployments import deployments_router  # noqa: E402

from .http_utils import auth_header, register_api_key  # noqa: E402


@pytest.fixture()
def app(http_db):
    application = FastAPI()
    application.include_router(deployments_router(http_db))
    return application


@pytest.fixture()
async def client(app):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


_REPORT_BODY = {
    "kind": "plugin",
    "slug": "my-plugin",
    "version": "1.2.3",
    "status": "success",
    "started_at": "2026-01-01T00:00:00Z",
    "completed_at": "2026-01-01T00:00:05Z",
    "host_id": "vps-1",
    "repo": "acme/my-plugin@1.2.3",
}


async def test_report_deployment_with_valid_api_key(client, http_engine):
    await register_api_key(http_engine, raw_key="xdk_test_valid", user_id="agent-user")

    resp = await client.post(
        "/deployments/report",
        json=_REPORT_BODY,
        headers={"X-API-Key": "xdk_test_valid"},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["deployer_id"] == "agent-user"
    assert body["status"] == "success"
    assert body["slug"] == "my-plugin"


async def test_report_deployment_rejects_unknown_api_key(client, http_engine):
    resp = await client.post(
        "/deployments/report", json=_REPORT_BODY, headers={"X-API-Key": "xdk_unknown"}
    )
    assert resp.status_code == 401


async def test_report_deployment_missing_api_key_header(client):
    resp = await client.post("/deployments/report", json=_REPORT_BODY)
    assert resp.status_code == 422  # FastAPI: required header missing


async def test_report_deployment_rejects_invalid_status(client, http_engine):
    await register_api_key(http_engine, raw_key="xdk_test_valid2", user_id="agent-user")
    bad_body = {**_REPORT_BODY, "status": "pending"}

    resp = await client.post(
        "/deployments/report", json=bad_body, headers={"X-API-Key": "xdk_test_valid2"}
    )
    assert resp.status_code == 422  # pydantic field_validator rejects it


async def test_list_deployments_scoped_to_caller(client, http_engine, fake_auth):
    await register_api_key(http_engine, raw_key="xdk_dev1", user_id="dev-1")
    await register_api_key(http_engine, raw_key="xdk_dev2", user_id="dev-2")
    await client.post(
        "/deployments/report", json=_REPORT_BODY, headers={"X-API-Key": "xdk_dev1"}
    )
    await client.post(
        "/deployments/report",
        json={**_REPORT_BODY, "slug": "other-plugin"},
        headers={"X-API-Key": "xdk_dev2"},
    )

    fake_auth.register_user("tok-dev1", sub="dev-1")
    resp = await client.get("/deployments", headers=auth_header("tok-dev1"))

    assert resp.status_code == 200
    slugs = {d["slug"] for d in resp.json()}
    assert slugs == {"my-plugin"}


async def test_deployment_fleet_view_latest_per_host(client, http_engine, fake_auth):
    await register_api_key(http_engine, raw_key="xdk_dev1", user_id="dev-1")
    await client.post(
        "/deployments/report",
        json={**_REPORT_BODY, "host_id": "vps-1", "version": "1.0.0"},
        headers={"X-API-Key": "xdk_dev1"},
    )
    await client.post(
        "/deployments/report",
        json={**_REPORT_BODY, "host_id": "vps-1", "version": "1.1.0"},
        headers={"X-API-Key": "xdk_dev1"},
    )
    await client.post(
        "/deployments/report",
        json={**_REPORT_BODY, "host_id": "vps-2", "version": "1.0.0"},
        headers={"X-API-Key": "xdk_dev1"},
    )

    fake_auth.register_user("tok-dev1", sub="dev-1")
    resp = await client.get(
        "/deployments/plugin/my-plugin/hosts", headers=auth_header("tok-dev1")
    )

    assert resp.status_code == 200
    by_host = {d["host_id"]: d["version"] for d in resp.json()}
    assert by_host == {"vps-1": "1.1.0", "vps-2": "1.0.0"}
