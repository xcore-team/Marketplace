# Page & Route Reference

All routes are declared flat in `src/App.tsx`. `RequireAuth` — noted below
as **Protégée** — redirects to `/auth?mode=login` when there's no user in
`useAuthStore`.

| Route | Page | Auth |
|-------|------|------|
| `/` | `HomePage` | Publique |
| `/plugins` | `PluginsPage` | Publique |
| `/plugins/:slug` | `PluginDetailPage` | Publique |
| `/services` | `ServicesPage` | Publique |
| `/services/:slug` | `ServiceDetailPage` | Publique |
| `/auth`, `/auth/callback` | `AuthPage` | Publique |
| `/invite/:token` | `InviteAcceptPage` | Publique (accepte ensuite une session) |
| `/about`, `/vision`, `/sponsors` | `AboutPage`, `VisionPage`, `SponsorsPage` | Publique |
| `/dashboard` ("Atelier") | `DashboardPage` | **Protégée** |
| `/dashboard/plugins/:slug/edit` | `PluginEditPage` | **Protégée** |
| `/dashboard/team` | `TeamSettingsPage` | **Protégée** |
| `/deployments` | `DeploymentsPage` | **Protégée** |
| `/settings` | `SettingsPage` | **Protégée** |
| `/admin` | `AdminPage` (xadmin panel) | **Protégée** (RBAC gated inside the page) |
| `*` | redirect to `/` | — |

## Catalogue: `PluginsPage` / `ServicesPage`

Dense list pattern (search bar, sort select, category filter pills,
pagination) — `ListRow` per item (title, description, meta: version,
downloads/installs, rating, category pill). Backed by
`plugins.list()`/`services.list()` with the same query params server-side
(`search`, `category_id`, `sort`, `limit`, `offset`).

## Detail: `PluginDetailPage` / `ServiceDetailPage`

GitHub-repo-page layout: header (name, slug eyebrow, published/draft
`Pill`, latest-version `Pill`) → `Tabs` → main column + `AboutPanel`
sidebar (~70/30 split).

Tabs (both pages share the same set except **Contributeurs**, plugin-only):

| Tab | Content |
|-----|---------|
| Aperçu | Overview — stats (downloads/installs, rating, version count), description |
| Documentation | README, fetched from `xdocs` — hidden if none exists |
| Sécurité | Pipeline gate list for the latest version (`StatusIcon` + `Pill` per gate) |
| Intégration | `integration.yaml`/`INTEGRATION.md` content from the repo — hidden if none |
| Contributeurs | **Plugins only** — `CONTRIBUTORS.yaml` content — hidden if none |
| Versions | Version history, latest badge |
| Avis | Ratings — list + submit-a-rating form |

Sidebar (`AboutPanel`): categories as topic pills, homepage/repository
links, license, download/install + rating stats, owner-only inline
edit/delete.

## Atelier ("workshop") — `/dashboard`

`DashboardPage` is a thin left-sidebar shell (not a top-tab bar — chosen
deliberately so it reads as a control panel, distinct from the document-like
detail pages above) routing between four panels, all under
`src/features/dashboard/`:

### Soumettre — `SubmitPanel`

1. Link a GitHub account (`POST /marketplace/github/link` with a PAT, or
   OAuth via `githubApi.linkViaOAuth()` — requests the `repo` scope on top
   of an existing login, notified server-side via the `xauth.oauth.linked`
   event).
2. Pick a repo (filtered server-side to ones containing `plugin.yaml`) and
   an existing Git tag.
3. Configure target version, categories, visibility (public/private).
4. **CI/CD** (`CiWorkflowPanel`, collapsed by default) — appears once a repo
   is selected:
   - creates an `xdevkeys` API key scoped to that repo inline (reuses
     `RevealedKeyBanner` from `components/ui/`) — no detour to the
     Deployments page needed for this specific use case,
   - fetches and displays the ready-to-commit
     `.github/workflows/xcore-publish.yml` (from
     `GET /marketplace/github/repos/{owner}/{repo}/ci-workflow`) with a
     copy button.
5. "Lancer la publication" → `POST /marketplace/github/publish` → `202`,
   tracked via `my-submissions` query + SSE toast on completion.

### Mes plugins — `SubmissionsPanel`

Submission history (issue-list pattern: `StatusIcon` + `Pill`, expandable
pipeline report per submission) plus the developer's published plugins.

### Services — `ServicesPanel`

Same shape as Submissions/Submit, scoped to `xservices` extensions instead
of marketplace plugins.

### Webhooks — `WebhooksPanel`

CRUD for outbound webhook subscriptions (HMAC-SHA256 signed deliveries).

## Team settings — `/dashboard/team`

`Tabs`: **Membres** / **Invitations** / **Rôles** / **Général**. Backed by
`teams`, `teams.invites`, `teams.roles`, `teams.memberRoles` in
`src/api/index.ts` — which map onto the backend's tenant + RBAC +
invitations routes (`app/auth`, see
[../backend/API.md §6](../backend/API.md#6-authentification-xauth-auth) —
this replaced a standalone `xorgs` plugin that no longer exists). Role
management here is the "owner-scoped" RBAC surface: a tenant owner
manages their own tenant's roles/permissions without needing a platform
admin.

## Deployments — `/deployments`

`Tabs`: **Suivi** (Fleet) / **Projets & clés**.

- **Suivi** — grouped by `(kind, slug)`, one row per host showing its most
  recent reported deployment (`StatusIcon`), sourced from
  `GET /xdeployments/deployments` + `.../hosts`.
- **Projets & clés** — `xdevkeys` project + API key management for **all**
  three kinds (`plugin`, `service`, `xdeploy`), not just deployment agents:
  create a project (name, kind, target slug — auto-generated id for
  `xdeploy`), create a key for it (reveal-once via `RevealedKeyBanner` —
  `deployment_credential` shown alongside the key only for `xdeploy`-kind
  projects), revoke keys/delete projects. `xdeploy`-kind projects also get
  a manifest editor (`ManifestSection`) and published-artifact browser
  (`ArtifactsSection`, with a "Dernière" badge on the newest version).
  Below that: a single signing-key panel (create/rotate/delete the HMAC
  key used to sign installable ZIPs).

## Settings — `/settings`

Single-column stack of `Panel`s (not the tabbed pattern used elsewhere):
pending invitations banner (if any), Apparence (theme toggle), Profil,
Changer d'e-mail, Authentification (change password), Double
authentification (MFA — TOTP setup/enable/disable), Sessions actives
(list + revoke), Comptes liés (OAuth providers linked/unlinked).

## Auth — `/auth`, `/invite/:token`

`AuthPage` handles every auth mode in one component: login, register,
forgot/reset password, MFA challenge, and the onboarding
create-or-join-tenant step (`/setup/create`, `/setup/join` — see
[../backend/API.md §6.1](../backend/API.md#61-compte-onboarding--tokens)),
plus the post-login redirect handoff. `InviteAcceptPage` is the landing
page for an invitation link
(`{WEB_APP_URL}/invite/:token` — a direct frontend URL, never a deep-link;
see the auth email templates).
