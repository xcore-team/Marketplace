# Frontend Architecture

XCoreHub's frontend is a React 18 + TypeScript single-page app built with
Vite, living in a separate repository from the FastAPI backend it talks to
(see [../backend/architecture.md](../backend/architecture.md)). UI copy is
in French. There is no CSS framework, no generated API client, and no
Redux-style global store beyond a handful of small Zustand stores — the
codebase favors a small number of hand-rolled primitives reused everywhere
over per-page one-offs.

## Commands

```bash
npm run dev       # Vite dev server on :5173
npm run build     # tsc -b (project references) && vite build
npm run preview   # preview a production build
```

`npm run build` outputs to `../static/dist` — **outside this repo**, into
the backend's sibling `static/` directory (see `vite.config.ts`), not to a
local `dist/`. There is no lint/test setup (no ESLint/Prettier config, no
test runner).

TypeScript uses project references (`tsconfig.json` → `tsconfig.app.json`
for `src`, `tsconfig.node.json` for `vite.config.ts`) — run `tsc -b`, not a
plain `tsc`, to get correct project-wide checking.

## Talking to the backend

### Dev: a same-origin proxy, not CORS

In development the browser only ever talks to `:5173`. `vite.config.ts`
proxies `/app` and `/ws` to `http://localhost:8000`:

```ts
server: {
  proxy: {
    "/app": { target: "http://localhost:8000", changeOrigin: true },
    "/ws": { target: "http://localhost:8000", changeOrigin: true, ws: true },
  },
}
```

This is why the backend's `cors.allow_origins` list (production domains
only) never bites in local dev — no cross-origin request is ever actually
made. In production, `vercel.json` rewrites serve the same role
(`/app/(.*)` and `/ws/(.*)` routed to the real backend), and `main.py`
serves the built SPA itself for everything else.

### `src/api/index.ts` — the API layer

A single hand-rolled fetch client, no axios, no generated SDK. Everything
funnels through an internal `call<T>(path, opts)` that:
- prefixes requests with `BASE = "http://localhost:8000/app"` in dev
  (served through the proxy above, not a direct cross-origin call),
- attaches the JWT bearer token from `localStorage` (`xc_token`)
  automatically,
- on a `401`, transparently calls `tryRefresh()` (`xc_refresh`) and retries
  once — concurrent refreshes are deduped through a single in-flight
  promise so a burst of `401`s doesn't fire a refresh storm.

Exports are grouped into namespaced objects mirroring the backend's plugin
route prefixes — `auth`, `oauth`, `teams` (`teams.invites`, `teams.roles`,
`teams.memberRoles`), `plugins`, `services`, `webhooks`, `mfa`, `password`,
`admin`, `categories`, `github`, `docs`, `submissions`, `devkeys`
(`devkeys.projects`, `devkeys.signingKey`), `deployments`,
`xdeployArtifacts`. When adding a new backend endpoint, add it to the
matching namespace rather than creating a new top-level export — and check
the actual response shape against the backend route before typing it (see
[pages.md](pages.md) for a recent example where a stub existed with the
wrong type for months because nothing called it).

### Types (`src/types/index.ts`)

Every API request/response shape is hand-mirrored here as a plain
interface. There is no OpenAPI codegen — when a backend response shape
changes, this file has to be updated by hand alongside the `src/api` call
site. This is the most common source of drift between frontend and
backend; when in doubt, read the actual FastAPI route/response_model rather
than trusting an existing type.

## State management

- **Server state** — TanStack Query (`@tanstack/react-query`), configured
  in `main.tsx` (2 min `staleTime`, no retry on `404`/`401`). Pages call
  `src/api` functions from `useQuery`/`useMutation`; query keys are plain
  arrays (`['devkeys-projects']`, `['github-tags', repo]`, …) invalidated
  explicitly on mutation success.
- **Client/session state** — Zustand, one store per concern under
  `src/stores/`:
  - `auth.ts` — current `user`, `initialize()` (bootstraps a session from a
    stored token via `auth.me()`), `logout()`, `switchTeam()`.
  - `theme.ts` — `light`/`dark`, persisted to `localStorage` via Zustand's
    `persist` middleware; toggled by adding/removing a `.light-theme` class
    on `document.documentElement` (`App.tsx`).
  - `notifications.ts` — in-app notification list, separate from the
    ephemeral toast system (`components/Toast.tsx`).

## Realtime updates

`src/hooks/useXPulse.ts` is an SSE hook (`EventSource`) subscribed to the
backend's XPulse stream (`notification`/`broadcast` channels). It refreshes
the access token before connecting and auto-reconnects with a 5s backoff on
error. `App.tsx` uses it globally, turning `SUBMISSION_PIPELINE_DONE` and
`ADMIN_BROADCAST` events into toasts.

## Routing & auth guarding (`App.tsx`)

Routes are declared flat with `react-router-dom` — see
[pages.md](pages.md) for the full route table. Protected routes are
wrapped in `<RequireAuth>` (`components/RequireAuth.tsx`), which redirects
to `/auth?mode=login` when there's no user in `useAuthStore`. On mount,
`App` checks for a stored token and calls `initialize()`; until
`initialized` is true, a full-page spinner replaces the route tree.

## Code organization

Feature folders under `src/features/<feature>/`, each typically a thin
page shell plus a `components/` (or flat, feature-specific) subfolder for
panels used only there:

```
src/features/
  plugins/      PluginsPage, PluginDetailPage, PluginEditPage
  services/     ServicesPage, ServiceDetailPage
  dashboard/    DashboardPage (thin sidebar shell) + SubmitPanel,
                SubmissionsPanel, ServicesPanel, WebhooksPanel,
                CiWorkflowPanel, shared.tsx
  team/         TeamSettingsPage + panels (Members/Invites/Roles/General)
  deployments/  DeploymentsPage (Fleet + Projects/keys tabs)
  auth/         AuthPage, InviteAcceptPage
  settings/     SettingsPage
  marketing/    HomePage, AboutPage, VisionPage, SponsorsPage
```

`AdminPage.tsx` (the `xadmin` panel) stays a standalone top-level page —
it's intentionally not part of the feature-folder rebuild.

### Shared UI primitives (`src/components/ui/`)

A small set of primitives built once and reused everywhere, rather than
per-page bespoke markup:

| Component | Purpose |
|-----------|---------|
| `Panel` | Bordered box — the base building block; replaces old `.card`/`.info-box` ad-hoc classes |
| `Tabs` | Tab bar, used by detail pages and settings-style pages alike |
| `ListRow` | Dense list row (title, description, meta, optional side content) — GitHub-repo-list-style, replaces card grids |
| `Pill` | Small status/label badge |
| `Avatar` | Avatar circle |
| `RelativeTime` | Centralized "3 hours ago"-style date formatting |
| `StatusIcon` | Maps a gate/submission/deployment status string to an icon + semantic color |
| `AboutPanel` | Composes `Panel` into a GitHub-repo-page-style sidebar (categories, links, stats) |
| `RevealedKeyBanner` | Reveal-once banner for a freshly created `xdevkeys` API key — shared between the Deployments page (agent `xdevkey`/`deployment_credential`) and the Atelier's CI/CD panel (`XCORE_API_KEY`) |

## Styling

A single global stylesheet, `src/styles/index.css` (~2400 lines), defines
the whole design system as CSS custom properties on `:root` — colors,
radii (`--r-*`), shadows (`--sh-*`), transitions (`--t-*`), spacing — with
a `.light-theme` class override block for the light palette. Components use
plain `className` strings from this stylesheet; inline `style` is reserved
for one-off values computed from data (a score-dependent bar color, a
per-item highlight). Fonts are loaded via Google Fonts `<link>` tags in
`index.html`; the current pairing is Inter (headings + body) and
JetBrains Mono (code).

The design language deliberately follows GitHub's dense, bordered,
low-chrome structural pattern — flat surfaces, 1px borders doing the
layout separation (not shadows/glow/blur), dense list rows over card grids.
The one deliberate departure: the mascot artwork and its teal accent
(`--acc` family, `#00C896` dark / `#009e78` light) are the brand's own,
kept intentionally distinct from GitHub's actual blue/green palette.
