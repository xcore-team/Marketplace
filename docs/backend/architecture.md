# System Architecture

XCore Marketplace is a FastAPI application built on the proprietary `xcore`
framework, which loads independent **plugins** (each an isolated app with its
own routes, models, and permissions) and shares a small set of **extensions**
(cross-plugin services: email, WebSocket, pub/sub, file storage, mail
proxying) across them. The root `backends/integration.yaml` is the single
source of truth for which plugins/extensions load, the database, Redis,
Celery queues, CORS, and the sandbox's allowed imports.

## Plugins

| Plugin | Directory | Responsibility |
|--------|-----------|-----------------|
| `auth` (branded "XAuth") | `app/auth/` | Multi-tenant auth: JWT RS256, OAuth (Google/GitHub/Discord/Microsoft), MFA (TOTP), tenants, invitations, fine-grained RBAC, audit log |
| `marketplace` | `app/marketplace/` | Plugin CRUD, submissions, ratings, categories, GitHub-based publishing |
| `xdevkeys` | `app/xdevkeys/` | Developer API keys, deployment projects, signing keys |
| `xdeploy` | `app/xdeploy/` | The `.xdeploy` Hub — sealed multi-component bundle storage/distribution (see [Two deployment circuits](#two-deployment-circuits)) |
| `xdeployments` | `app/xdeployments/` | Fleet-status journal: what `xcore-agent` actually deployed, where |
| `XPulses` (branded "xpulse") | `app/XPulses/` | SSE stream + Redis pub/sub subscriber — pushes worker/admin events to the browser |
| `xdocs` | `app/xdocs/` | Extracts README/integration docs from validated plugin ZIPs / GitHub repos |
| `xadmin` | `app/xadmin/` | Admin panel routes (users, stats, moderation, audit) |
| `xservices` | `app/xservices/` | "Extensions" marketplace — the same submission/pipeline machinery as `marketplace`, for service-style dependencies a plugin can declare (own `service_orchestrator.py`, own Celery tasks) |

Nine plugins load at boot (`xcore.runtime.loader — plugins load summary
loaded=9 failed=0`). There is no `xorgs` plugin any more — team/organization
management (tenants, invitations, RBAC) was folded into `auth` during the
"restructuration du système d'authentification" pass; see
[API.md §6](API.md#6-authentification-xauth-auth).

## Extensions (shared services)

Registered under `services.extensions` in `integration.yaml`, injected into
plugins via `self.get_service("ext.<name>")`:

| Extension | Module | Purpose |
|-----------|--------|---------|
| `email` | `extensions/xmailler` | Async SMTP (aiosmtplib), local Jinja2 template rendering |
| `web_socket` | `extensions/xwebsocket` | Multi-channel WebSocket server (`user`, `admin`, `broadcast`, `platform`) |
| `pubsub` | `extensions/pubsub` | Redis pub/sub client, pluggable providers |
| `mail_proxy` | `extensions/xmailproxy` | Forwards admin-targeted mail via Redis |
| `storage` | `extensions/xstorage` | Generic blob storage (`local` / `s3` / `r2` / `supabase` backends) — used by `xdeploy` for sealed artifact bytes |

A plugin calling `get_service("ext.<name>")` for a name that isn't
registered raises `KeyError` immediately at `on_load()` — there is no silent
fallback. `xdeploy` in particular has a **hard** (non-optional) dependency on
`ext.storage`; if that entry is ever removed from `integration.yaml`, the
whole plugin fails to load.

## The submission pipeline

Two layers, not one:

```
SandboxedPipeline (sandbox/pipeline.py)
  — extracts the uploaded ZIP into an isolated /tmp working dir
  — enforces CPU/memory/time limits on the whole run
  — auto-generates a mock .env stub for plugins declaring
    envconfiguration.inject: true in plugin.yaml (see below)
      │
      ▼
PipelineOrchestrator (pipelines/orchestrator.py)
  — runs the 11 gates, aggregates findings into a SubmissionResult
```

`sandbox/pipeline.py`'s `SandboxedPipeline` is what Celery tasks
(`app/marketplace/src/tasks.py`, `app/xservices/src/tasks.py`) actually
instantiate. It handles extraction/isolation and then hands off to
`pipelines/orchestrator.py`'s `PipelineOrchestrator.run_all()` for the
gate execution itself. `xservices` uses a parallel
`pipelines/service_orchestrator.py` with its own intake/sandbox steps
(`pipelines/steps/service_intake.py`, `service_sandbox.py`) validated against
`service.yaml` instead of `plugin.yaml`, but shares gates 2–4 and 6–10 with
the plugin pipeline.

### Gate execution flow

1. `POST /app/marketplace/submissions` (or `/github/publish`,
   `/github/.../recompute`) returns `202` immediately and enqueues a Celery
   task on the `submissions` queue.
2. **Gate 1** (Intake) runs synchronously and can short-circuit the whole
   pipeline: if its score alone is ≥ 80 (`SCORE_AUTO_REJECT`), the pipeline
   returns `REJECTED` immediately without running gates 2–11.
3. Otherwise, **gates 2 through 11 run concurrently** via `asyncio.gather()`
   — total wall time is bounded by the slowest gate, not their sum.
4. Findings from every gate are aggregated; the total `anomaly_score`
   determines the final `SubmissionStatus` (see
   [scoring.md](scoring.md)). `gate_7` (signing) additionally returns the
   `merkle_root` and `sig_bundle` used to publish the version.
5. On completion, the worker task updates `Submission.status` +
   `PluginVersion.publish_status` in the DB, publishes a Redis event
   (`xpulse` relays it to the browser via SSE), and queues a result email
   via `xmailproxy`.

See [gates.md](gates.md) for what each of the 11 gates actually checks.

### The `.env` stub mechanism

`pipelines/common.py::_ensure_dotenv` is a small but load-bearing detail:
when a submitted plugin declares `envconfiguration.inject: true` in
`plugin.yaml`, several gates (5 and 11 in particular, which actually import
and/or execute the plugin's entry point in a sandboxed subprocess) need it to
be able to *start* without crashing on missing real credentials. Before
running those gates, the pipeline generates a throwaway `.env` next to the
extracted source, filling declared keys with pattern-matched mock values
(`DATABASE_URL` → a local SQLite stub, `*_SECRET`/`*_KEY` → placeholder
strings, `*_PORT` → `8080`, etc. — see `_ENV_MOCK_RULES`). This lets a
realistic plugin boot far enough for behavioral/runtime gates to observe it,
without ever touching real infrastructure. Visible in worker logs as
`[pipeline] .env stub créé : .env (N var(s))`.

## Two deployment circuits

There are two **independent, non-overlapping** ways a plugin/service ends up
running on a host:

1. **Marketplace direct** (`app/marketplace/src/routes/install.py`,
   `app/xservices/src/routes/install.py`) — single plugin/service at a time,
   plain (unencrypted) ZIP, signed with the developer's HMAC-SHA256
   `signing_key` (`app/xdevkeys`, encrypted at rest via `DEVKEYS_MASTER_KEY`).
   `xcore-agent deploy-marketplace` / `watch-marketplace` consume this. Every
   deployment attempt is logged to `xdeployments` via
   `POST /app/xdeployments/deployments/report`.
2. **`.xdeploy` Hub** (`app/xdeploy`) — end-to-end encrypted **multi-plugin**
   bundles: tar → zstd → AES-256-GCM → Ed25519 signature, sealed only by the
   `xcore-agent` CLI. The Hub (this plugin) never sees plaintext — it stores
   ciphertext blobs (via `ext.storage`), wraps/unwraps the DEK with a
   server-held KEK (`XDEPLOY_KEK`), and issues short-lived session tokens
   (`XDEPLOY_SESSION_SECRET`) scoped to one project. `xcore-agent build` /
   `publish` / `deploy` / `deploy-marketplace` / `watch` consume this
   contract — see `xcore_agent/agent/hub_client.py` in the agent repo for the
   client-side implementation, and [API.md §xdeploy](API.md) for the full
   `/v1/*` contract.

Both circuits report into the **same** `xdep_deployments` table
(`app/xdeployments`) for a unified fleet view, distinguished by `kind`
(`"plugin"`, `"service"`, or `"xdeploy"`).

## GitHub-triggered CI/CD

Both `marketplace` and `xservices` expose a CI-friendly re-publish endpoint:
`POST /app/{marketplace,xservices}/github/repos/{owner}/{repo}/tags/{tag}/recompute`,
authenticated by `X-API-Key` (any active `xdevkeys` key — this endpoint does
**not** check the key's project kind/slug, unlike the marketplace *install*
flow). A generated GitHub Actions workflow
(`GET .../github/repos/{owner}/{repo}/ci-workflow`) calls it on every
`git push --tags`, so a developer's own CI re-triggers the full pipeline
without any manual step. Re-processing an already-published
`(plugin, version)` is a safe no-op (`PluginService.add_version` checks for
an existing row before inserting) rather than a crash.

## Observability

`pipelines/common.py::Tracer` wraps `opentelemetry.trace.get_tracer` and
instruments `run_all`/`gate_1_intake`/`parallel_gates` with real spans **if**
the `opentelemetry` package is importable — otherwise every span is a
no-op `DummySpan`. Whether those spans go anywhere is a separate question:
`integration.yaml`'s `observability.tracing.enabled` is `false` by default,
so spans are created in-process but not exported unless you configure an
OTLP collector and flip that flag. Structured JSON logging
(`observability.logging`) and Prometheus metrics (`observability.metrics`)
are the two observability channels actually active out of the box.

## Data flow

```
Frontend (React/Vite :3000/:5173)
    ↕ REST + SSE + WebSocket
FastAPI (:8000)  →  plugins via XCore router
    ↕                    ↕
  Redis           SQLite (dev) / PostgreSQL (prod)
    ↕
Celery Worker  (queues: default, submissions, result)
    ↕
SandboxedPipeline → PipelineOrchestrator (11 gates, /tmp isolation)
```
