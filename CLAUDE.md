# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
uv sync
pip install -e .   # Required — Celery workers fork processes that don't inherit sys.path

# Run everything (API + Celery worker)
python3 run.py [--host 0.0.0.0] [--port 8000] [--reload] [--no-celery] [--no-api]

# Run API only
python3 main.py

# Run Celery worker only
celery -A celery_app worker --loglevel=info -Q submissions,default -c 4

# Celery inspection
celery -A celery_app inspect registered
celery -A celery_app inspect active
celery -A celery_app purge -Q submissions
```

No test suite exists yet (high-priority TODO before production).

## Architecture

This is a **FastAPI + XCore framework** plugin marketplace with async SQLAlchemy, Redis, and Celery.

### XCore Plugin System

Plugins live in `app/` and must expose a class inheriting `TrustedBase` (or `AutoDispatchMixin`) with an `on_load()` method. XCore calls `on_load()` at startup. Routes are mounted at `/app/<plugin_name>` automatically via `get_router()`.

```
app/
  xauth/src/main.py       # Plugin class → registers auth routes, seeds DB
  marketplace/src/main.py # Plugin class → registers marketplace/submission routes
  xadmin/src/main.py      # Plugin class → admin panel (users, plugins, submissions, stats, audit, system)
  xdocs/src/main.py       # Plugin class → exposes embedded plugin docs (README.md, integration.md, contributor.yaml)
  xpulse/                 # SSE real-time notifications via Redis pub/sub
```

### Request Auth Flow

JWT (RS256) → `app/xauth/src/backend.py` decodes to `AuthPayload`:
```python
{ "sub": "uuid", "roles": [...], "permissions": [...], "user": {"tenant_id": ..., "email": ...} }
```

Use `Depends(require_permission("perm:name"))` on routes. Add new permissions in `app/xauth/src/services/seed.py::PERMISSIONS` — `run_seed()` is idempotent.

### Submission Pipeline (async)

`POST /submissions` → Celery task `marketplace.process_submission` → `SandboxedPipeline.run()` → `PipelineOrchestrator.run_all()` (9 gates) → DB update → email + Redis/SSE notification.

Pipeline scoring thresholds (in `pipelines/models.py`):
- `< 20` → `approved`
- `20–49` → `manual_review`
- `≥ 80` → `rejected`

Marketplace auto-publish threshold: `SCORE_AUTO_PUBLISH = 30` in `PluginService` (separate from pipeline thresholds).

Gate 1 (Intake/manifest validation) is the only **blocking** gate. All others are non-blocking.

### Real-time Notifications

- **From API routes**: `events.emit("ext.notification.publish", {...})`
- **From Celery worker**: Redis `PUBLISH` directly (worker has no access to xcore event bus — different process)
- xpulse listens to Redis and pushes to SSE clients at `GET /app/xpulse/stream`

### Adding a Celery Task

1. Decorate with `@task` from `xcore.sdk` in `app/<plugin>/src/tasks.py`
2. Import the tasks module in the xworker extension before `register_pending_tasks()`
3. Dispatch via `from xcore.sdk import task_registry; task_registry["name"].apply_async(kwargs={...}, queue="...")`

### Verified Plugin Storage

Approved ZIPs are stored locally in `verified/{slug}/{version}/`. Production TODO: move to object storage (S3/GCS).

## Configuration

Primary config: `integration.yaml` (DB, Redis, extensions, security).  
Env vars: copy `.env.example` → `.env` (SMTP) and `extensions/.env.example` → `extensions/.env` (Celery).

Default admin: `admin@gmail.com` / `Hunters123@`

## Known Pitfalls

- **`ModuleNotFoundError` in worker**: Run `pip install -e .` — editable install is required so forked Celery processes can find `pipelines`, `sandbox`, `app`, `extensions`.
- **Pydantic V2**: Don't use `_: AuthPayload = Depends(...)` — leading underscores are forbidden. Use `current_user: AuthPayload`.
- **Never name a folder `extensions/celery/`**: it would shadow the `celery` pip package. The Celery extension (`extensions.xworker`) is provided by the xcore SDK.
- **Empty roles after login**: User needs a `TenantMember` row. The seed creates one for admin; registration creates one for new users. `backend.py` auto-resolves the first tenant when `tenant_id` is absent from the JWT.
- **Pipeline rejects valid ZIP**: Check `GET /submissions/{id}/report` → gate failure reason → verify manifest (gate 1 is blocking) → check `integration.yaml::security.forbidden_imports`.
