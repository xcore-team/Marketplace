# XCore Marketplace — Documentation

## [Backend](backend/)

- [architecture.md](backend/architecture.md) — plugins, extensions, the
  two-layer submission pipeline, both deployment circuits, GitHub CI/CD
- [API.md](backend/API.md) — full REST reference (auth, marketplace,
  xdevkeys, xdeploy, xservices, xadmin, xdeployments, xpulse, xdocs)
- [gates.md](backend/gates.md) — the 11 security/compliance gates
- [scoring.md](backend/scoring.md) — severity weights and status thresholds
- [contributing.md](backend/contributing.md) — adding a new gate
- [frontend-integration.md](backend/frontend-integration.md) — auth/SSE/
  WebSocket integration guide, backend's-eye view

## [Frontend](frontend/)

- [architecture.md](frontend/architecture.md) — API layer, state
  management, realtime updates, code organization, shared UI primitives
- [pages.md](frontend/pages.md) — route table and what each page does

## Where to start

Building against the API? [backend/API.md](backend/API.md).
Working on the pipeline? [backend/architecture.md](backend/architecture.md)
then [backend/gates.md](backend/gates.md).
Working on the frontend? [frontend/architecture.md](frontend/architecture.md)
then [frontend/pages.md](frontend/pages.md).
