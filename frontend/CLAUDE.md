# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Frontend for **XCoreHub** ("xcore-marketplace"), a marketplace web app for discovering, installing, and publishing plugins for the XCore ecosystem. React 18 + TypeScript SPA built with Vite. UI copy is in French.

This repo only contains the frontend. It talks to a separate FastAPI backend (a sibling project) that is not part of this repo — see "Backend integration" below.

## Commands

```bash
npm run dev       # vite dev server on port 5173
npm run build     # tsc -b (project references) && vite build
npm run preview   # preview a production build
```

There is no lint or test setup in this repo (no ESLint/Prettier config, no test runner configured).

`npm run build` outputs to `../static/dist` (see `vite.config.ts`), i.e. **outside this repo**, into a sibling `static` directory — not to a local `dist/`. Keep this in mind when validating a build or wiring up deploy tooling.

TypeScript uses project references (`tsconfig.json` → `tsconfig.app.json` for `src`, `tsconfig.node.json` for `vite.config.ts`); run `tsc -b` (as `npm run build` does) rather than a plain `tsc` to get correct project-wide checking.

## Architecture

### API layer (`src/api/index.ts`)
Single hand-rolled fetch client — no generated SDK, no axios. Everything goes through an internal `call<T>(path, opts)` that:
- prefixes requests with `BASE = "http://localhost:8000/app"` (hardcoded; production traffic is routed to the real backend via the `/app/(.*)` and `/ws/(.*)` rewrites in `vercel.json`),
- attaches the JWT bearer token from `localStorage` (`xc_token`) automatically,
- on a `401`, transparently calls `tryRefresh()` (using `xc_refresh`) and retries the request once; concurrent refreshes are deduped via a single in-flight `_refreshing` promise.

Exports are grouped into namespaced objects that mirror the backend's route prefixes: `auth`, `oauth`, `teams` (incl. `teams.invites`, `teams.roles`, `teams.memberRoles`), `plugins`, `webhooks`, `mfa`, `password`, `admin` (xadmin), `categories`, `github`, `docs` (xdocs), `submissions`. When adding a new endpoint, add it to the matching namespace rather than creating a new top-level export.

### Types (`src/types/index.ts`)
All API request/response shapes live here as plain interfaces, hand-mirroring the backend's models. There's no codegen from the backend's OpenAPI schema, so when a backend response shape changes, this file has to be updated manually along with any `src/api` call sites.

### State management
- **Server state**: TanStack Query (`@tanstack/react-query`), configured in `main.tsx` (2 min staleTime, no retry on 404/401). Pages call into `src/api` functions from `useQuery`/`useMutation`.
- **Client/session state**: Zustand, one store per concern in `src/stores/`:
  - `auth.ts` — current `user`, `initialize()` (bootstraps session from a stored token via `auth.me()`), `logout()`, `switchTeam()`.
  - `theme.ts` — `light`/`dark`, persisted to localStorage via zustand's `persist` middleware.
  - `notifications.ts` — in-app notification list (separate from the toast system).

There is no Redux/Context-based global store beyond these.

### Realtime updates (`src/hooks/useXPulse.ts`)
SSE hook (`EventSource`) subscribing to the backend's `XPulse` stream (`notification`/`broadcast` channels). Refreshes the access token before connecting, and auto-reconnects with a 5s backoff on error. `App.tsx` uses it globally to turn `SUBMISSION_PIPELINE_DONE` and `ADMIN_BROADCAST` events into toasts (via `useToast` from `components/Toast.tsx`).

### Routing & auth guarding (`App.tsx`)
`react-router-dom` routes are declared flat in `App.tsx`. Protected routes (dashboard, plugin edit, team settings, settings) are wrapped in `<RequireAuth>` (`components/RequireAuth.tsx`), which redirects to `/auth?mode=login` when there's no user in `useAuthStore`. On mount, `App` checks for a stored token and calls `initialize()`; until `initialized` is true, a full-page spinner is shown instead of routes.

### Styling
No CSS framework (no Tailwind, no CSS modules, no styled-components). A single global stylesheet at `src/styles/index.css` (~2400 lines) defines the whole design system as CSS custom properties on `:root` (colors, radii `--r-*`, shadows `--sh-*`, transitions `--t-*`, spacing), with a `.light-theme` class override block providing the light palette. Theme switching toggles that class on `document.documentElement` (done in `App.tsx` based on `useThemeStore`). Components use plain `className` strings from this stylesheet, with inline `style` reserved for one-off values computed from data (e.g. a score-dependent bar color). Fonts (Syne / Outfit / JetBrains Mono) are loaded via Google Fonts `<link>` tags in `index.html`.

### Backend integration
The backend is a separate FastAPI service (not in this repo) exposing route groups that map to the `src/api` namespaces: `/auth`, `/marketplace` (plugins/webhooks/submissions/categories/github), `/xadmin`, `/xdocs`, and the `XPulse` SSE stream. In local dev it's expected at `localhost:8000`; `vercel.json` rewrites handle routing in production deploys.
