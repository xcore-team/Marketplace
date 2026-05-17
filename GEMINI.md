# GEMINI.md — XCore Market Instructions

This project is the **XCore Market**, a marketplace for plugins built on the **xcore** framework. It features a security validation pipeline for plugin submissions.

## Project Overview

*   **Technology Stack:** Python 3.12+, FastAPI, SQLAlchemy (asyncpg/aiosqlite), Celery, Redis, Pydantic V2, `uv` for package management.
*   **Core Framework:** [xcore](https://github.com/traoreera/xcore) — provides plugin management, service injection, and infrastructure orchestration.
*   **Main Components:**
    *   `app/`: Contains project-specific plugins (`xauth`, `marketplace`, `xpulse`, `xadmin`, `xdocs`).
    *   `extensions/`: Shared infrastructure extensions (`xmailler`, `xwebsocket`, `worker`).
    *   `pipelines/`: Security validation engine with 9 gates (Intake, Static Analysis, Secrets, Sandbox, etc.).
    *   `sandbox/`: Isolated environment for plugin execution and analysis.
    *   `middleware/`: Standard security and rate-limiting middlewares.
*   **Architecture:** Modular plugin-based architecture. The API is hosted by FastAPI, and long-running security checks are handled asynchronously by Celery workers.

## Building and Running

### Prerequisites
*   Python 3.12+
*   Redis (Broker & Backend)
*   `uv` (Python package manager)

### Installation
```bash
# Sync dependencies
uv sync

# INSTALL LOCAL PACKAGES AS EDITABLE (CRITICAL for Celery workers)
python3 -m pip install -e .
```

### Configuration
1.  Copy `.env.example` to `.env` (check root and `extensions/`).
2.  Review `integration.yaml` for database and service settings.

### Execution
*   **API Server:** `python3 main.py` or `make dev` (port 8000).
*   **Celery Worker:** `celery -A extensions.worker.app worker -Q submissions,default -c 4`
*   **Tests:** `pytest` or `make test`.
*   **Docker:** `docker compose up --build` (includes API, Redis, Worker, and Flower).

## Development Conventions

### 1. Plugin Development
*   New plugins go in `app/<plugin_name>/src/`.
*   Inherit from `TrustedBase` or `AutoDispatchMixin`.
*   Register routes in `on_load()` via `self.kernel.include_router()`.
*   Follow the standard directory structure: `models/`, `routes/`, `schemas/`, `services/`.

### 2. Authentication & RBAC
*   Use `Depends(require_permission("perm:name"))` for route protection.
*   The `AuthPayload` (returned by `get_current_user`) contains user ID, roles, and permissions.
*   **Pydantic V2 Hint:** Never use leading underscores for dependency variables (e.g., use `current_user`, not `_`).

### 3. Asynchronous Tasks (Celery)
*   Define tasks in `tasks.py` using the `@task` decorator from `extensions.worker.registry`.
*   Trigger tasks using `task_registry["task.name"].apply_async()`.
*   Always ensure the task module is imported in `extensions/worker/main.py` for worker discovery.

### 4. Database & Models
*   Use SQLAlchemy 2.0 async patterns.
*   Migrations are currently manual (Alembic support is a TODO); `create_all` is often used in `on_load()` for development.

### 5. Security Pipeline
*   Logic resides in `pipelines/gates/`.
*   The `SandboxedPipeline` orchestrates the extraction and validation process.
*   Results are persisted in `Submission` and `PluginVersion` models.

## Key Files
*   `integration.yaml`: Central configuration for xcore (DB, Redis, Extensions, Middlewares).
*   `main.py`: Application entry point.
*   `CLAUDE.md`: Implementation guide and quick commands.
*   `CONTRIBUTING.md`: Detailed developer guide.
*   `pyproject.toml`: Dependencies and project metadata.

## Roadmap & TODOs
*   [ ] Implement Alembic migrations.
*   [ ] Transition from local ZIP storage to S3-compatible storage.
*   [ ] Increase test coverage for pipelines and core services.
*   [ ] Add full-text search for plugins.
