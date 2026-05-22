# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

XCore Marketplace is a **plugin marketplace platform** where developers submit Python plugin ZIPs that go through an 11-gate automated security pipeline before being published. It is built on top of a proprietary `xcore` framework (from `traoreera/xcore` on GitHub) that wraps FastAPI with a plugin-based architecture.

## Development Commands

```bash
# Install dependencies
uv sync
pip install -e .   # required for Celery workers to find app packages

# Start the API server (dev mode)
uv run main.py     # FastAPI on http://localhost:8000

# Start the Celery worker (separate terminal)
celery -A app.marketplace.src.tasks worker -loglevel=info -Q submissions,default -c 4

# Or start both via Docker
docker-compose up

# Plugin signing utility
uv run sign_plugins.py

# Run tests (pytest-asyncio in auto mode, SQLite in-memory)
uv run pytest
uv run pytest tests/test_pipeline_models.py   # single test file
```

## Architecture

### Plugin System (XCore Framework)

All app components are **XCore plugins** — they do not register FastAPI routes directly. Each plugin:
- Lives in `app/<plugin_name>/`
- Has an `integration.yaml` describing its routes, permissions, models, and dependencies
- Is loaded by the XCore runtime via `on_load()` hooks
- Receives injected services (DB session, Redis, email, etc.) via dependency injection

The root `integration.yaml` is the master config: it declares which plugins to load, the database, Redis, Celery queues, CORS origins, allowed/forbidden imports for sandboxing, and observability settings.

### Key Plugins

| Plugin | Path | Responsibility |
|--------|------|----------------|
| `marketplace` | `app/marketplace/` | Core: plugin CRUD, submissions, ratings, categories, async pipeline trigger |
| `xauth` | `app/xauth/` | Auth: JWT RS256, OAuth (Google/GitHub/Discord/Microsoft), MFA (TOTP), RBAC, audit log |
| `xpulse` | `app/xpulse/` | Real-time: SSE stream, Redis pub/sub subscriber, pushes worker events to browser |
| `xdocs` | `app/xdocs/` | Extracts README/integration docs from validated plugin ZIPs |
| `xdevkeys` | `app/xdevkeys/` | Developer API key management |
| `xadmin` | `app/xadmin/` | Admin panel routes |
| `xservices` | `app/xservices/` | Service extension validation (own Celery tasks in `app.xservices.src.tasks`) |

### Extensions (Shared Services)

`extensions/` contains reusable non-plugin services injected into plugins via `integration.yaml`:
- **xmailler**: Async SMTP email (aiosmtplib)
- **xwebsocket**: WebSocket multi-channel server (channels: user, admin, broadcast, platform)
- **extpubsub**: Redis pub/sub client with pluggable providers (redis, memory, hyvemq)
- **xmailproxy**: Mail proxy (admin email forwarding via Redis)

### Async Pipeline (11 Gates)

When a plugin ZIP is submitted:
1. `POST /app/marketplace/submissions` → returns `202` immediately, enqueues Celery task
2. Celery worker runs `SandboxedPipeline` (in `pipelines/` + `sandbox/`)
3. **Gate 1** (Intake) runs synchronously and blocks; remaining gates run in parallel via `asyncio.gather()`
4. Gates: `intake` → `static_analysis`, `supply_chain`, `secrets`, `sandbox`, `behavioral`, `signing`, `compliance`, `supply_health`, `http_audit`, `runtime_sandbox`
5. On completion: updates `Submission.status` + `PluginVersion.publish_status` in DB, publishes Redis event → xpulse → SSE to browser, sends email

`pipelines/service_orchestrator.py` handles the equivalent flow for `xservices` extension ZIPs (validated against `service.yaml` instead of `plugin.yaml`).

### Data Flow

```
Frontend (React/Vite :3000/:5173)
    ↕ REST + SSE + WebSocket
FastAPI (:8000)  →  plugins via XCore router
    ↕                    ↕
  Redis           SQLite (dev) / PostgreSQL (prod)
    ↕
Celery Worker  (queues: default, submissions, result)
    ↕
PipelineOrchestrator (11 gates, /tmp isolation)
```

### Authentication Flow

1. Frontend sends `Authorization: Bearer <JWT>` (RS256, keys in `conf/`)
2. XCore middleware decodes JWT, loads permissions from Redis cache (TTL 300s) or DB
3. Routes use `Depends(require_permission("permission.name"))` for RBAC
4. Default admin seeded from `app/xauth/src/seed.py`

### Middleware

Custom middleware lives in `middleware/` and is registered in `integration.yaml`:
- `security_headers` — HTTP security headers
- `upload_size` — enforces 10 MB upload limit
- `rate_limit` — 200 req/min default

## Tech Stack

- **Backend**: Python 3.12+, FastAPI (via xcore), SQLAlchemy async, Alembic (not yet configured — uses `create_all()`)
- **Queue**: Celery 5.6+ with Redis broker; queues: `default`, `submissions`, `result`
- **Database**: SQLite locally (dev), PostgreSQL + asyncpg in production
- **Cache**: Redis (TTL 300s, max 10K entries)
- **Real-time**: SSE (xpulse), WebSocket (xwebsocket), Redis pub/sub
- **Frontend**: React 18, TypeScript 5.5, Vite 5.4, Zustand, React Query, React Router
- **Package manager**: `uv` (Python), `npm`/`pnpm` (frontend in `frontend/`)
- **Security scanning**: semgrep, detect-secrets, pip-audit, OpenSSF scoring
- **Observability**: File logging (`log/app.log`), Prometheus metrics, OpenTelemetry (configured but tracing disabled)

## Key Conventions

- **Workers need editable install**: Celery workers run in separate processes and must find app packages via `pip install -e .`; forgetting this causes `ModuleNotFoundError`
- **Pydantic V2**: All schemas use V2 syntax (`model_validator`, `field_validator`, not V1 validators)
- **Async everywhere**: DB queries, email sending, HTTP clients — all async; never use sync SQLAlchemy in FastAPI routes
- **Plugin ZIPs signed**: Published versions get a `.sig.json` (Merkle root) via `sign_plugins.py`
- **Sandbox isolation**: Plugin code runs in `/tmp` with CPU/memory limits; never execute untrusted plugin code outside the sandbox
- **Tests use in-memory SQLite**: `tests/conftest.py` wires up an async SQLite engine per test; no external DB needed

## Environment

Copy `.env` for local dev. Key variables:
- `DATABASE_URL` — SQLite locally: `sqlite+aiosqlite:///./db.sqlite3`
- `REDIS_URL` / `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` — `redis://localhost:6379`
- `SECRET_KEY`, `SERVER_KEY` — JWT signing secrets
- `DEVKEYS_MASTER_KEY` — Dev key encryption
- `MARKETPLACE_TOKEN` — token for xcorehub.dev marketplace API
- SMTP config for xmailler (`XAUTH_SMTP_HOST`, `XAUTH_SMTP_PORT`, `XAUTH_SMTP_USER`, `XAUTH_SMTP_PASSWORD`, `XAUTH_SMTP_FROM`, `XAUTH_SMTP_FROM_NAME`, `XAUTH_SMTP_USE_TLS`)
- `ADMIN_EMAIL` — recipient for xmailproxy admin forwarding
