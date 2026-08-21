import type {
  ApiKey,
  ApiKeyCreated,
  Category,
  Contributor,
  Deployment,
  DeploymentAdmin,
  DeveloperOut,
  GHTag,
  Invite,
  LinkedAccount,
  Manifest,
  PagedResponse,
  Permission,
  Plugin,
  PluginAdmin,
  PluginDoc,
  Rating,
  Role,
  Service,
  ServiceCategory,
  ServiceDoc,
  ServiceRating,
  ServiceSubmission,
  ServiceSummary,
  Session,
  SigningKey,
  Submission,
  SubmissionReport,
  BackendNotification,
  Tenant,
  TenantMembership,
  TenantMemberWithRoles,
  TenantSettings,
  TokenResponse,
  User,
  UserGithubLink,
  Webhook,
  Project,
  XDeployArtifact,
} from "../types";

// Relative on purpose — the dev server proxies /app to the local backend
// (vite.config.ts) and prod serves API + SPA from the same origin (either
// directly, or via vercel.json rewrites), so the browser never needs to make
// a cross-origin request and CORS never comes into play.
const BASE = "/app";

// ── Token storage ──────────────────────────────────────────────────────────────

export const getToken = () => localStorage.getItem("xc_token");
export const setToken = (t: string | null) =>
  t ? localStorage.setItem("xc_token", t) : localStorage.removeItem("xc_token");
export const getRefreshToken = () => localStorage.getItem("xc_refresh");
export const setRefreshToken = (t: string | null) =>
  t
    ? localStorage.setItem("xc_refresh", t)
    : localStorage.removeItem("xc_refresh");

// ── Core fetch ─────────────────────────────────────────────────────────────────

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "APIError";
  }
}

let _refreshing: Promise<string | null> | null = null;

export async function tryRefresh(): Promise<string | null> {
  const rt = getRefreshToken();
  if (!rt) return null;
  if (_refreshing) return _refreshing;

  _refreshing = fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: rt }),
  })
    .then(async (r) => {
      if (!r.ok) {
        setToken(null);
        setRefreshToken(null);
        return null;
      }
      const data: TokenResponse = await r.json();
      setToken(data.access_token);
      if (data.refresh_token) setRefreshToken(data.refresh_token);
      return data.access_token;
    })
    .catch(() => {
      setToken(null);
      setRefreshToken(null);
      return null;
    })
    .finally(() => {
      _refreshing = null;
    });

  return _refreshing;
}

async function call<T>(
  path: string,
  opts: RequestInit = {},
  _retry = true,
): Promise<T> {
  const token = getToken();
  const isForm = opts.body instanceof FormData;

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      ...(!isForm ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });

  // Auto-refresh on 401 if we have a refresh token
  if (res.status === 401 && _retry) {
    const newToken = await tryRefresh();
    if (newToken) return call<T>(path, opts, false);
  }

  if (!res.ok) {
    let msg = `Erreur ${res.status}`;
    try {
      const j = await res.json();
      msg = j.detail ?? JSON.stringify(j);
    } catch {
      /* ignore */
    }
    throw new APIError(res.status, msg);
  }

  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export const auth = {
  register: (email: string, password: string) =>
    call<User>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, tenant_slug: "default" }),
    }),

  loginRaw: (email: string, password: string): Promise<TokenResponse> =>
    call<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  login: async (email: string, password: string): Promise<User> => {
    const tokens = await call<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (tokens.mfa_required) {
      throw Object.assign(new Error("MFA_REQUIRED"), {
        mfa_token: tokens.mfa_token,
      });
    }
    setToken(tokens.access_token);
    setRefreshToken(tokens.refresh_token);
    return call<User>("/auth/me");
  },

  verifyMfaLogin: async (mfa_token: string, code: string): Promise<User> => {
    const tokens = await call<TokenResponse>("/auth/mfa/verify-login", {
      method: "POST",
      body: JSON.stringify({ mfa_token, code }),
    });
    setToken(tokens.access_token);
    setRefreshToken(tokens.refresh_token);
    return call<User>("/auth/me");
  },

  // Onboarding après un login/signup sans tenant (mot de passe ou OAuth) —
  // fonctionne uniquement à partir du refresh_token "pending" déjà stocké,
  // aucun access_token requis (voir OnboardingService côté backend).
  setupCreate: async (name: string, slug: string): Promise<User> => {
    const refresh_token = getRefreshToken() ?? "";
    const tokens = await call<TokenResponse>("/auth/setup/create", {
      method: "POST",
      body: JSON.stringify({ refresh_token, name, slug }),
    });
    setToken(tokens.access_token);
    setRefreshToken(tokens.refresh_token);
    return call<User>("/auth/me");
  },

  logout: async () => {
    const refresh_token = getRefreshToken() ?? "";
    try {
      await call("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refresh_token }),
      });
    } finally {
      setToken(null);
      setRefreshToken(null);
    }
  },

  me: () => call<User>("/auth/me"),

  oauthUrl: (provider: string) =>
    `${BASE}/auth/oauth/${provider}/authorize?direct=true&redirect=${encodeURIComponent(window.location.origin + "/auth/callback")}`,

  changeEmail: (new_email: string, password: string, opt_code?: string) =>
    call<User>("/auth/account/email", {
      method: "PATCH",
      body: JSON.stringify({ new_email, password, opt_code }),
    }),

  // Onboarding après acceptation d'une invitation par un utilisateur qui vient
  // de s'inscrire (pas encore de tenant) — même mécanique que setupCreate.
  setupJoin: async (inviteToken: string): Promise<User> => {
    const refresh_token = getRefreshToken() ?? "";
    const tokens = await call<TokenResponse>("/auth/setup/join", {
      method: "POST",
      body: JSON.stringify({ refresh_token, invite_token: inviteToken }),
    });
    setToken(tokens.access_token);
    setRefreshToken(tokens.refresh_token);
    return call<User>("/auth/me");
  },
};

// ── Sessions actives ─────────────────────────────────────────────────────────

export const sessions = {
  list: () => call<Session[]>("/auth/auth/sessions"),
  revoke: (sessionId: string) =>
    call(`/auth/auth/sessions/${sessionId}`, { method: "DELETE" }),
  revokeAll: () => call("/auth/auth/sessions", { method: "DELETE" }),
};

// ── Notifications (persistées côté backend) ─────────────────────────────────

export const notifications = {
  list: (params: { limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set("limit", String(params.limit));
    if (params.offset) q.set("offset", String(params.offset));
    return call<BackendNotification[]>(`/auth/notifications?${q}`);
  },
  markRead: (id: string) =>
    call<BackendNotification>(`/auth/notifications/${id}/read`, { method: "PATCH" }),
  markAllRead: () => call("/auth/notifications/read-all", { method: "PATCH" }),
  delete: (id: string) => call(`/auth/notifications/${id}`, { method: "DELETE" }),
};

// ── OAuth account linking (Settings — connect/disconnect a provider) ───────────
//
// Distinct from `auth.oauthUrl` (initial login/signup): linking requires the
// caller to already be authenticated, so `startLink` fetches the authorize
// endpoint (auth header attached by `call()`) instead of navigating the
// browser straight to it — a plain `window.location.href` navigation carries
// no Authorization header, and the httponly access_token cookie set on login
// is `secure`-only, so it wouldn't survive a plain http:// dev origin either.

export const oauth = {
  listAccounts: () => call<LinkedAccount[]>("/auth/oauth/me/accounts"),

  startLink: async (provider: string): Promise<void> => {
    const redirect = window.location.origin + "/settings";
    // `link_user_id=1` déclenche le mode liaison côté backend — sa valeur
    // exacte est ignorée (l'identité vient du Bearer token), seule sa
    // présence compte (voir routes/oauth.py::authorize). Sans lui, le
    // callback traite la requête comme un login normal, jamais une liaison.
    const data = await call<{ auth_url: string; provider: string }>(
      `/auth/oauth/${provider}/authorize?link_user_id=1&redirect=${encodeURIComponent(redirect)}`,
    );
    window.location.href = data.auth_url;
  },

  unlink: (provider: string) => call(`/auth/oauth/${provider}/unlink`, { method: "DELETE" }),
};

// ── Teams (app/auth tenants) ────────────────────────────────────────────────────

export const teams = {
  list: () => call<Tenant[]>("/auth/tenants/"),

  create: (data: { name: string; slug: string }) =>
    call<Tenant>("/auth/tenants/", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  get: (tenantId: string) => call<Tenant>(`/auth/tenants/${tenantId}`),

  update: (tenantId: string, data: { name?: string; settings?: Record<string, unknown> }) =>
    call<Tenant>(`/auth/tenants/${tenantId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (tenantId: string) => call(`/auth/tenants/${tenantId}`, { method: "DELETE" }),

  settings: {
    get: (tenantId: string) => call<TenantSettings>(`/auth/tenants/${tenantId}/settings`),
    update: (tenantId: string, settings: Record<string, unknown>) =>
      call<TenantSettings>(`/auth/tenants/${tenantId}/settings`, {
        method: "PUT",
        body: JSON.stringify({ settings }),
      }),
  },

  members: (tenantId: string) =>
    call<TenantMembership[]>(`/auth/tenants/${tenantId}/members`),

  removeMember: (tenantId: string, userId: string) =>
    call(`/auth/tenants/${tenantId}/members/${userId}`, { method: "DELETE" }),

  // Permissions/rôles effectifs de l'utilisateur courant dans son tenant actif.
  myPermissions: () => call<string[]>("/auth/rbac/me/permissions"),
  myRoles: () => call<string[]>("/auth/rbac/me/roles"),

  // Swaps stored tokens for ones scoped to the new active team, same as auth.login.
  select: async (tenantId: string): Promise<User> => {
    const refresh_token = getRefreshToken() ?? "";
    const tokens = await call<TokenResponse>("/auth/select-tenant", {
      method: "POST",
      body: JSON.stringify({ refresh_token, tenant_id: tenantId }),
    });
    setToken(tokens.access_token);
    setRefreshToken(tokens.refresh_token);
    return call<User>("/auth/me");
  },

  // ── Invitations ────────────────────────────────────────────────────────────
  invites: {
    list: (tenantId: string) => call<Invite[]>(`/auth/invites/${tenantId}`),

    create: (data: { tenant_id: string; email: string; role_id?: string; expires_hours?: number }) =>
      call<Invite>("/auth/invites/", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    revoke: (inviteId: string) =>
      call(`/auth/invites/${inviteId}`, { method: "DELETE" }),

    // Invitations en attente pour l'email de l'utilisateur connecté.
    mine: () => call<Invite[]>("/auth/invites/me"),

    // Public — permet de prévisualiser une invitation avant de l'accepter.
    getByToken: (token: string) => call<Invite>(`/auth/invites/token/${token}`),

    accept: (token: string, userId: string) =>
      call<{ tenant_id?: string }>("/auth/invites/accept", {
        method: "POST",
        body: JSON.stringify({ token, user_id: userId }),
      }),
  },

  // ── Rôles & permissions (délégués par le owner du tenant) ─────────────────
  roles: {
    list: (tenantId: string) => call<Role[]>(`/auth/rbac/tenants/${tenantId}/roles`),

    create: (
      tenantId: string,
      data: { name: string; description?: string; permissions: string[] },
    ) =>
      call<Role>(`/auth/rbac/tenants/${tenantId}/roles`, {
        method: "POST",
        body: JSON.stringify(data),
      }),

    delete: (tenantId: string, roleId: string) =>
      call(`/auth/rbac/tenants/${tenantId}/roles/${roleId}`, { method: "DELETE" }),

    addPermission: (tenantId: string, roleId: string, permissionName: string) =>
      call<Role>(`/auth/rbac/tenants/${tenantId}/roles/${roleId}/permissions`, {
        method: "POST",
        body: JSON.stringify({ permission_name: permissionName }),
      }),

    removePermission: (tenantId: string, roleId: string, permissionName: string) =>
      call(
        `/auth/rbac/tenants/${tenantId}/roles/${roleId}/permissions/${encodeURIComponent(permissionName)}`,
        { method: "DELETE" },
      ),
  },

  grantablePermissions: (tenantId: string) =>
    call<Permission[]>(`/auth/rbac/tenants/${tenantId}/grantable`),

  // ── Membres + rôles (vue enrichie, owner uniquement) ───────────────────────
  membersWithRoles: (tenantId: string) =>
    call<TenantMemberWithRoles[]>(`/auth/rbac/tenants/${tenantId}/members`),

  memberRoles: {
    list: (tenantId: string, userId: string) =>
      call<string[]>(`/auth/rbac/tenants/${tenantId}/members/${userId}/roles`),

    add: (tenantId: string, userId: string, roleId: string) =>
      call(`/auth/rbac/tenants/${tenantId}/members/${userId}/roles`, {
        method: "POST",
        body: JSON.stringify({ role_id: roleId }),
      }),

    remove: (tenantId: string, userId: string, roleId: string) =>
      call(`/auth/rbac/tenants/${tenantId}/members/${userId}/roles/${roleId}`, {
        method: "DELETE",
      }),
  },
};

// ── Plugins ────────────────────────────────────────────────────────────────────

export const plugins = {
  list: (
    params: {
      limit?: number;
      offset?: number;
      search?: string;
      category_id?: string;
      sort?: string;
    } = {},
  ) => {
    const q = new URLSearchParams();
    if (params.limit) q.set("limit", String(params.limit));
    if (params.offset) q.set("offset", String(params.offset));
    if (params.search) q.set("search", params.search);
    if (params.category_id) q.set("category_id", params.category_id);
    if (params.sort) q.set("sort", params.sort);
    return call<PagedResponse<Plugin>>(`/marketplace/plugins?${q}`);
  },

  get: (slug: string) => call<Plugin>(`/marketplace/plugins/${slug}`),

  create: (data: {
    name: string;
    description?: string;
    homepage?: string;
    repository?: string;
    category_ids?: string[];
    visibility?: string;
  }) =>
    call<Plugin>("/marketplace/plugins", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  delete: (slug: string) => call(`/marketplace/plugins/${slug}`, { method: "DELETE" }),

  mine: (scope: "mine" | "team" = "mine") =>
    call<Plugin[]>(`/marketplace/plugins/me/plugins?scope=${scope}`),

  checkName: (name: string) =>
    call<{ available: boolean; slug: string }>(
      `/marketplace/plugins/check-name?name=${encodeURIComponent(name)}`,
    ),

  rate: (slug: string, score: number, comment?: string) =>
    call<Rating>(`/marketplace/plugins/${slug}/ratings`, {
      method: "POST",
      body: JSON.stringify({ score, comment }),
    }),

  ratings: (slug: string) =>
    call<PagedResponse<Rating>>(`/marketplace/plugins/${slug}/ratings`),

  myRating: (slug: string) =>
    call<Rating>(`/marketplace/plugins/${slug}/ratings/me`),

  submissions: (slug: string) =>
    call<Submission[]>(`/marketplace/plugins/${slug}/submissions`),

  report: (submissionId: string) =>
    call<SubmissionReport>(`/marketplace/submissions/${submissionId}/report`),

  update: (
    slug: string,
    data: { description?: string; homepage?: string; repository?: string; visibility?: string },
  ) =>
    call<Plugin>(`/marketplace/plugins/${slug}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
};

// ── Webhooks ───────────────────────────────────────────────────────────────────

export const webhooks = {
  list: () => call<Webhook[]>("/marketplace/webhooks"),
  create: (data: { url: string; secret?: string; events?: string }) =>
    call<Webhook>("/marketplace/webhooks", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  toggle: (id: string) =>
    call<Webhook>(`/marketplace/webhooks/${id}/toggle`, {
      method: "PATCH",
    }),
  delete: (id: string) =>
    call(`/marketplace/webhooks/${id}`, { method: "DELETE" }),
};

// ── MFA & Password ─────────────────────────────────────────────────────────────

export const mfa = {
  setup: () =>
    call<{ secret: string; provisioning_uri: string; backup_codes: string[] }>(
      "/auth/mfa/setup",
      { method: "POST" },
    ),
  enable: (code: string) =>
    call<{ mfa_enabled: boolean }>("/auth/mfa/enable", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  verify: (code: string) =>
    call<{ valid: boolean }>("/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  disable: () => call("/auth/mfa/", { method: "DELETE" }),
};

export const password = {
  forgot: (email: string) =>
    call("/auth/password/forgot", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  reset: (data: { token: string; new_password: string }) =>
    call("/auth/password/reset", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  change: (data: { current_password: string; new_password: string }) =>
    call("/auth/account/password", {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  set: (data: { new_password: string }) =>
    call("/auth/password/set", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

// ── Admin (xadmin) ────────────────────────────────────────────────────────────

export const admin = {
  // ── Stats & broadcast (xadmin, pas de sous-préfixe) ─────────────────────
  stats: () => call<any>("/xadmin/stats"),
  broadcast: (message: string) =>
    call("/xadmin/broadcast", {
      method: "POST",
      body: JSON.stringify({ message }),
    }),

  // ── Utilisateurs (xadmin /users) ─────────────────────────────────────────
  users: (params: any = {}) =>
    call<PagedResponse<User>>(`/xadmin/users?${new URLSearchParams(params)}`),
  banUser: (id: string) =>
    call<any>(`/xadmin/users/${id}/ban`, { method: "PATCH" }),
  unbanUser: (id: string) =>
    call<any>(`/xadmin/users/${id}/unban`, { method: "PATCH" }),
  deleteUser: (id: string) => call(`/xadmin/users/${id}`, { method: "DELETE" }),

  // ── Plugins (xadmin /plugins) ─────────────────────────────────────────────
  plugins: (params: any = {}) =>
    call<PagedResponse<Plugin>>(
      `/xadmin/plugins?${new URLSearchParams(params)}`,
    ),
  updatePlugin: (slug: string, data: { is_published: boolean }) =>
    call<Plugin>(
      `/xadmin/plugins/${slug}/publish?published=${data.is_published}`,
      { method: "PATCH" },
    ),
  deletePlugin: (slug: string) =>
    call(`/xadmin/plugins/${slug}`, { method: "DELETE" }),
  yankVersion: (slug: string, version: string, reason: string) =>
    call<any>(
      `/xadmin/plugins/${slug}/versions/${version}/yank?${new URLSearchParams({ reason })}`,
      { method: "POST" },
    ),

  // ── Soumissions (xadmin /submissions) ────────────────────────────────────
  submissions: (params: any = {}) =>
    call<PagedResponse<Submission>>(
      `/xadmin/submissions?${new URLSearchParams(params)}`,
    ),
  updateSubmissionStatus: (
    id: string,
    status: "approved" | "rejected" | "manual_review" | "pending",
  ) =>
    call<Submission>(`/xadmin/submissions/${id}/status?new_status=${status}`, {
      method: "PATCH",
    }),

  // ── Catégories (xadmin /categories) ──────────────────────────────────────
  categoriesList: () => call<any[]>("/xadmin/categories"),
  categoryCreate: (data: {
    name: string;
    slug: string;
    description?: string;
  }) =>
    call<any>("/xadmin/categories", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  categoryDelete: (id: string) =>
    call(`/xadmin/categories/${id}`, { method: "DELETE" }),
  categoryUpdate: (id: string, data: { name?: string; description?: string }) =>
    call<any>(`/xadmin/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  // ── Audit & système (xadmin /audit, /system) ──────────────────────────────
  audit: (params: any = {}) =>
    call<any[]>(`/xadmin/audit?${new URLSearchParams(params)}`),
  systemInfo: () => call<any>("/xadmin/system/info"),
  systemDb: () => call<any>("/xadmin/system/db"),

  // ── Déploiements (xadmin /deployments) ────────────────────────────────────
  deployments: (params: any = {}) =>
    call<PagedResponse<DeploymentAdmin>>(
      `/xadmin/deployments?${new URLSearchParams(params)}`,
    ),
  purgeDeployments: (params: { keep_per_bucket?: number; max_age_days?: number } = {}) =>
    call<{ deleted: number }>(
      `/xadmin/deployments/purge?${new URLSearchParams(params as any)}`,
      { method: "POST" },
    ),

  // ── Développeurs & contributeurs (xadmin /plugins) ────────────────────────
  developers: (params: any = {}) =>
    call<PagedResponse<DeveloperOut>>(
      `/xadmin/plugins/developers?${new URLSearchParams(params)}`,
    ),
  developerPlugins: (developerId: string) =>
    call<PluginAdmin[]>(`/xadmin/plugins/developers/${developerId}/plugins`),
  pluginContributors: (slug: string) =>
    call<Contributor[]>(`/xadmin/plugins/${slug}/contributors`),

  submissionReport: (id: string) => call<SubmissionReport>(`/xadmin/submissions/${id}/report`),

  userGithub: (userId: string) => call<UserGithubLink>(`/xadmin/users/${userId}/github`),
  assignUserRole: (userId: string, data: { role_id: string; tenant_id: string }) =>
    call(`/xadmin/users/${userId}/roles`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ── Modération Services (xservices-admin) ─────────────────────────────────
  services: (params: any = {}) =>
    call<Service[]>(`/xservices/admin/services?${new URLSearchParams(params)}`),
  deleteService: (id: string) => call(`/xservices/admin/services/${id}`, { method: "DELETE" }),
  yankServiceVersion: (serviceId: string, version: string, reason: string) =>
    call<any>(
      `/xservices/admin/services/${serviceId}/versions/${version}/yank?${new URLSearchParams({ reason })}`,
      { method: "POST" },
    ),
  serviceSubmissions: (params: any = {}) =>
    call<ServiceSubmission[]>(`/xservices/admin/submissions?${new URLSearchParams(params)}`),
  approveServiceSubmission: (id: string) =>
    call<any>(`/xservices/admin/submissions/${id}/approve`, { method: "POST" }),
  rejectServiceSubmission: (id: string, reason?: string) =>
    call<any>(
      `/xservices/admin/submissions/${id}/reject?${new URLSearchParams(reason ? { reason } : {})}`,
      { method: "POST" },
    ),
};

// ── Categories ─────────────────────────────────────────────────────────────────

export const categories = {
  list: () =>
    call<Category[] | PagedResponse<Category>>("/marketplace/categories"),

  create: (data: { name: string; description?: string }) =>
    call<Category>("/marketplace/categories", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  plugins: (slug: string, params: { limit?: number; offset?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set("limit", String(params.limit));
    if (params.offset) q.set("offset", String(params.offset));
    return call<Plugin[]>(`/marketplace/categories/${slug}/plugins?${q}`);
  },
};

// ── GitHub ─────────────────────────────────────────────────────────────────────

export const github = {
  getLink: () =>
    call<{
      github_login: string;
      github_user_id: string;
      scopes: string | null;
      linked: boolean;
    }>("/marketplace/github/link"),
  link: (access_token: string) =>
    call<{ github_login: string; linked: boolean }>(
      "/marketplace/github/link",
      {
        method: "POST",
        body: JSON.stringify({ access_token }),
      },
    ),
  // Relie GitHub via OAuth avec le scope `repo` en plus (au lieu de coller un
  // PAT à la main) — le backend xauth échange le code, puis notifie le
  // marketplace en interne (événement xauth.oauth.linked) qui écrit dans
  // DeveloperGitHubToken avant même que ce redirect n'atteigne le navigateur.
  // Distinct de auth.oauthUrl (login) : ceci nécessite d'être déjà connecté
  // (link_user_id=1, identité prise du Bearer token — voir oauth.startLink).
  linkViaOAuth: async (): Promise<void> => {
    const redirect = window.location.origin + "/dashboard";
    const data = await call<{ auth_url: string; provider: string }>(
      `/auth/oauth/github/authorize?link_user_id=1&extra_scopes=repo&redirect=${encodeURIComponent(redirect)}`,
    );
    window.location.href = data.auth_url;
  },
  unlink: () => call("/marketplace/github/link", { method: "DELETE" }),
  // `manifest` filtre côté backend (HEAD sur chaque repo) aux seuls repos qui
  // contiennent ce fichier à la racine — sans lui, la liste montre TOUS les
  // repos GitHub liés, y compris des projets sans rapport avec XCore.
  repos: (page = 1, manifest?: string) =>
    call<
      Array<{
        id: number;
        name: string;
        full_name: string;
        description: string | null;
        private: boolean;
        default_branch: string;
        language: string | null;
        stargazers_count: number;
        updated_at: string;
        html_url: string;
      }>
    >(`/marketplace/github/repos?per_page=50&page=${page}&sort=updated${manifest ? `&manifest=${encodeURIComponent(manifest)}` : ""}`),
  publish: (data: {
    full_name: string;
    // Le déploiement est forcé sur un tag Git — le backend exige `tag` (pas
    // `default_branch`, qui n'existe même pas dans SubmitGitHubRequest) et le
    // valide contre plugin_version ('1.0.0' ou 'v1.0.0'), sinon 400.
    tag: string;
    plugin_version: string;
    category_ids?: string[];
    visibility?: "public" | "private";
  }) =>
    call<Submission>("/marketplace/github/publish", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  tags: (owner: string, repo: string) =>
    call<GHTag[]>(`/marketplace/github/repos/${owner}/${repo}/tags`),

  // Réponse réelle du backend : {filename, content} — le fichier YAML est prêt
  // à écrire tel quel sous ce nom, jamais {workflow, path} (ancien typage
  // jamais confronté à la vraie réponse, cette route n'était appelée nulle
  // part côté UI jusqu'ici).
  ciWorkflow: (owner: string, repo: string) =>
    call<{ filename: string; content: string }>(
      `/marketplace/github/repos/${owner}/${repo}/ci-workflow`,
    ),
};

// ── Docs (xdocs) ───────────────────────────────────────────────────────────────

export const docs = {
  get: (slug: string) => call<PluginDoc>(`/xdocs/plugins/${slug}/docs`),
  getForVersion: (slug: string, version: string) =>
    call<PluginDoc>(`/xdocs/plugins/${slug}/versions/${version}/docs`),
};

// ── Submissions ────────────────────────────────────────────────────────────────

export const submissions = {
  list: (scope: "mine" | "team" = "mine") =>
    call<Submission[]>(`/marketplace/submissions?scope=${scope}`),

  get: (id: string) => call<Submission>(`/marketplace/submissions/${id}`),

  report: (id: string) =>
    call<SubmissionReport>(`/marketplace/submissions/${id}/report`),

  submit: async (data: {
    file: File;
    plugin_name: string;
    plugin_version: string;
    category_ids?: string[];
  }): Promise<Submission> => {
    const fd = new FormData();
    fd.append("file", data.file);
    fd.append("plugin_name", data.plugin_name);
    fd.append("plugin_version", data.plugin_version);
    if (data.category_ids?.length) {
      fd.append("category_ids", JSON.stringify(data.category_ids));
    }
    return call<Submission>("/marketplace/submissions", {
      method: "POST",
      body: fd,
    });
  },
};

// ── Services (xservices) ────────────────────────────────────────────────────
//
// Second marketplace, en parallèle des "plugins" : mêmes mécaniques (pipeline
// de soumission, notation, docs extraites), mais pour des services déployables
// plutôt que des extensions XCore.

export const services = {
  list: (
    params: {
      limit?: number;
      offset?: number;
      search?: string;
      category_id?: string;
      sort?: string;
    } = {},
  ) => {
    const q = new URLSearchParams();
    if (params.limit) q.set("limit", String(params.limit));
    if (params.offset) q.set("offset", String(params.offset));
    if (params.search) q.set("search", params.search);
    if (params.category_id) q.set("category_id", params.category_id);
    if (params.sort) q.set("sort", params.sort);
    return call<ServiceSummary[]>(`/xservices/services?${q}`);
  },

  get: (slug: string) => call<Service>(`/xservices/services/${slug}`),

  mine: () => call<ServiceSummary[]>("/xservices/services/mine"),

  update: (
    slug: string,
    data: { description?: string; homepage?: string; repository?: string; visibility?: string },
  ) =>
    call<Service>(`/xservices/services/${slug}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  delete: (slug: string) => call(`/xservices/services/${slug}`, { method: "DELETE" }),

  install: (slug: string) => call(`/xservices/services/${slug}/install`, { method: "POST" }),

  rate: (slug: string, score: number, comment?: string) =>
    call<ServiceRating>(`/xservices/services/${slug}/ratings`, {
      method: "POST",
      body: JSON.stringify({ score, comment }),
    }),
  ratings: (slug: string) => call<ServiceRating[]>(`/xservices/services/${slug}/ratings`),
  myRating: (slug: string) => call<ServiceRating>(`/xservices/services/${slug}/ratings/me`),

  categories: () => call<ServiceCategory[]>("/xservices/categories"),

  docs: {
    get: (slug: string) => call<ServiceDoc>(`/xservices/services/${slug}/docs`),
    getForVersion: (slug: string, version: string) =>
      call<ServiceDoc>(`/xservices/services/${slug}/versions/${version}/docs`),
  },

  submissions: {
    list: () => call<ServiceSubmission[]>("/xservices/submissions"),
    get: (id: string) => call<ServiceSubmission>(`/xservices/submissions/${id}`),
    report: (id: string) => call<SubmissionReport>(`/xservices/submissions/${id}/report`),
    submit: async (data: {
      file: File;
      service_name: string;
      service_version: string;
      category_ids?: string[];
    }): Promise<ServiceSubmission> => {
      const fd = new FormData();
      fd.append("file", data.file);
      fd.append("service_name", data.service_name);
      fd.append("service_version", data.service_version);
      if (data.category_ids?.length) {
        fd.append("category_ids", JSON.stringify(data.category_ids));
      }
      return call<ServiceSubmission>("/xservices/submissions", {
        method: "POST",
        body: fd,
      });
    },
  },

  github: {
    publish: (data: {
      full_name: string;
      tag: string;
      service_version: string;
      category_ids?: string[];
      visibility?: "public" | "private";
    }) =>
      call<ServiceSubmission>("/xservices/github/publish", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
};

// ── Déploiements (xdeployments) ─────────────────────────────────────────────
//
// Suivi des instances déployées d'un plugin/service (fleet status). Le report
// de déploiement lui-même (POST .../report) est fait par l'agent XCore via une
// clé API — pas par ce frontend.

export const deployments = {
  list: (
    params: { slug?: string; host_id?: string; status?: string; limit?: number; offset?: number } = {},
  ) => {
    const q = new URLSearchParams();
    if (params.slug) q.set("slug", params.slug);
    if (params.host_id) q.set("host_id", params.host_id);
    if (params.status) q.set("status", params.status);
    if (params.limit) q.set("limit", String(params.limit));
    if (params.offset) q.set("offset", String(params.offset));
    return call<Deployment[]>(`/xdeployments/deployments?${q}`);
  },

  hosts: (kind: string, slug: string) =>
    call<Deployment[]>(`/xdeployments/deployments/${kind}/${slug}/hosts`),
};

// ── Artefacts .xdeploy (app/xdeploy — plugin distinct de xdeployments) ─────
//
// Le Hub xdeploy ne voit jamais le contenu en clair d'un artefact (scellé par
// xcore-agent, chiffré AES-256-GCM) — ces routes ne portent que sur les
// métadonnées déjà publiées (lister l'historique de versions, en retirer
// une). La publication elle-même se fait uniquement via l'agent CLI
// (POST /xdeploy/v1/projects/{id}/publish, authentifié par xdevkey).

export const xdeployArtifacts = {
  list: (projectId: string) =>
    call<XDeployArtifact[]>(`/xdeploy/projects/${projectId}/artifacts`),

  delete: (artifactId: string) =>
    call(`/xdeploy/artifacts/${artifactId}`, { method: "DELETE" }),
};

// ── Projets & clés de déploiement (xdevkeys) ────────────────────────────────
//
// Un "projet" cible un plugin ou un service (kind + slug) ; une clé API est
// rattachée à un projet et ne peut déployer QUE cette cible. La clé en clair
// n'est renvoyée qu'à la création (`create`) — impossible de la relire ensuite.

export const devkeys = {
  projects: {
    list: () => call<Project[]>("/xdevkeys/projects"),

    create: (data: { name: string; kind: "plugin" | "service" | "xdeploy"; slug: string }) =>
      call<Project>("/xdevkeys/projects", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    delete: (projectId: string) =>
      call(`/xdevkeys/projects/${projectId}`, { method: "DELETE" }),

    manifests: {
      // Manifeste déclaratif (en clair) d'un projet xdeploy — ne remplace pas
      // l'artefact .xdeploy scellé lui-même, jamais visible du Hub. Voir
      // backends/app/xdevkeys/src/models/project_manifest.py.
      list: (projectId: string) =>
        call<Manifest[]>(`/xdevkeys/projects/${projectId}/manifests`),

      latest: (projectId: string) =>
        call<Manifest>(`/xdevkeys/projects/${projectId}/manifests/latest`),

      create: (projectId: string, data: { tag: string; items: { kind: "plugin" | "service"; slug: string; version?: string | null }[] }) =>
        call<Manifest>(`/xdevkeys/projects/${projectId}/manifests`, {
          method: "POST",
          body: JSON.stringify(data),
        }),
    },
  },

  list: () => call<ApiKey[]>("/xdevkeys/api-keys"),

  create: (data: { name: string; project_id: string }) =>
    call<ApiKeyCreated>("/xdevkeys/api-keys", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  delete: (keyId: string) => call(`/xdevkeys/api-keys/${keyId}`, { method: "DELETE" }),

  signingKey: {
    get: () => call<SigningKey>("/xdevkeys/signing-key"),
    set: (data: { label?: string; secret?: string }) =>
      call<SigningKey>("/xdevkeys/signing-key", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    delete: () => call("/xdevkeys/signing-key", { method: "DELETE" }),
  },
};
