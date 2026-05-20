/**
 * Admin API client — typed fetch wrapper for xcore-market backend.
 * Auth routes:  /app/auth/<path>
 * Admin routes: /app/xadmin/<path>
 * Marketplace:  /app/marketplace/<path>
 * XPulse SSE:   /app/XPulse/<path>
 */

import { getCookie } from "./admin-auth";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

const XAUTH_BASE       = `${API_URL}/app/auth`;
const XADMIN_BASE      = `${API_URL}/app/xadmin`;
const MARKETPLACE_BASE = `${API_URL}/app/marketplace`;

// ── Error type ────────────────────────────────────────────────────────────────

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────

async function xcoreFetch<T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const clean = path.startsWith("/") ? path.slice(1) : path;
  const url = `${baseUrl}/${clean}`;

  const token = getCookie("admin_token");
  const authHeader: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401) {
    if (typeof window !== "undefined" && !path.includes("login")) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new AdminApiError(401, "Session expirée");
  }
  if (res.status === 403) throw new AdminApiError(403, "Permissions insuffisantes");

  if (!res.ok) {
    let detail: unknown;
    try { detail = await res.json(); } catch { detail = await res.text(); }
    const message =
      typeof detail === "object" && detail !== null && "detail" in detail
        ? String((detail as { detail: unknown }).detail)
        : `Erreur ${res.status}`;
    throw new AdminApiError(res.status, message, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Convenience helpers (admin routes) ───────────────────────────────────────

export const api = {
  get: <T>(path: string) =>
    xcoreFetch<T>(XADMIN_BASE, path, { method: "GET" }),

  post: <T>(path: string, body?: unknown) =>
    xcoreFetch<T>(XADMIN_BASE, path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(path: string, body?: unknown) =>
    xcoreFetch<T>(XADMIN_BASE, path, {
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  del: <T>(path: string) =>
    xcoreFetch<T>(XADMIN_BASE, path, { method: "DELETE" }),
};


// ── Auth endpoints (/app/auth/) ──────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_id?: string | null;
  tenant_id?: string | null;
}

export interface UserResponse {
  id: string;
  email: string;
  is_active: boolean;
  mfa_enabled: boolean;
}

function authFetch<T>(path: string, options: RequestInit = {}) {
  return xcoreFetch<T>(XAUTH_BASE, path, options);
}

export const authApi = {
  login: (email: string, password: string, tenant_id?: string) =>
    authFetch<TokenResponse>("login", {
      method: "POST",
      body: JSON.stringify({ email, password, tenant_id }),
    }),

  refresh: (refresh_token: string) =>
    authFetch<TokenResponse>("refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token }),
    }),

  logout: (refresh_token: string) =>
    authFetch<void>("logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token }),
    }),

  me: () => authFetch<UserResponse>("me", { method: "GET" }),
};

// ── Tenants (/tenants/) ───────────────────────────────────────────────────────

export interface TenantResponse {
  id: string;
  name: string;
  slug: string;
}

export const tenantsApi = {
  list: () => authFetch<TenantResponse[]>("tenants/", { method: "GET" }),
};

// ── Invitations (/invites/) ───────────────────────────────────────────────────

export interface InviteCreate {
  tenant_id: string;
  email: string;
  role_id?: string;
  expires_hours?: number;
}

export interface InviteResponse {
  id: string;
  tenant_id: string;
  email: string;
  token: string;
  role_id: string | null;
  expires_at: string;
  used_at: string | null;
  is_active: boolean;
  invited_by: string;
}

export const invitesApi = {
  create: (body: InviteCreate) =>
    authFetch<InviteResponse>("invites/", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  list: (tenantId: string) =>
    authFetch<InviteResponse[]>(`invites/${tenantId}`, { method: "GET" }),
};

// ── Shared pagination wrapper ─────────────────────────────────────────────────

export interface PageOut<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

// ── Dashboard / Stats (/stats) ────────────────────────────────────────────────

export interface GlobalStatsOut {
  users_total: number;
  users_active: number;
  plugins_total: number;
  plugins_published: number;
  submissions_total: number;
  submissions_pending: number;
  submissions_approved: number;
  submissions_rejected: number;
  submissions_manual_review: number;
  categories_total: number;
}

export const statsApi = {
  global: () => api.get<GlobalStatsOut>("stats"),

  broadcast: (text: string, channels: string[] = ["admin", "broadcast"]) => {
    const qs = `text=${encodeURIComponent(text)}&${channels.map(c => `channels=${encodeURIComponent(c)}`).join("&")}`;
    return xcoreFetch<XPulseBroadcastResult>(XPULSE_BASE, `broadcast?${qs}`, { method: "POST" });
  },
};

// ── Users (/users) ────────────────────────────────────────────────────────────

export interface UserAdminOut {
  id: string;
  email: string;
  display_name: string | null;
  github_login: string | null;
  is_active: boolean;
  mfa_enabled: boolean;
  created_at: string;
  plugin_count: number;
  submission_count: number;
  roles: string[];
}

export interface UserGitHubOut {
  github_login: string;
  github_user_id: string;
  linked_at: string;
}

export interface UserBanRequest {
  reason?: string;
}

export interface UserRoleAssign {
  role_id: string;
  tenant_id: string;
}

function buildQs(params: Record<string, string | number | boolean | undefined>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export const usersApi = {
  list: (params: { search?: string; is_active?: boolean; limit?: number; offset?: number } = {}) =>
    api.get<PageOut<UserAdminOut>>(`users${buildQs(params as Record<string, string | number | boolean | undefined>)}`),

  get: (userId: string) =>
    api.get<UserAdminOut>(`users/${userId}`),

  ban: (userId: string, body: UserBanRequest = {}) =>
    api.patch<void>(`users/${userId}/ban`, body),

  unban: (userId: string) =>
    api.patch<void>(`users/${userId}/unban`),

  delete: (userId: string) =>
    api.del<void>(`users/${userId}`),

  assignRole: (userId: string, body: UserRoleAssign) =>
    api.post<void>(`users/${userId}/roles`, body),

  github: (userId: string) =>
    api.get<UserGitHubOut>(`users/${userId}/github`),
};

// ── Plugins (/plugins) ────────────────────────────────────────────────────────

export interface PluginAdminOut {
  id: string;
  name: string;
  slug: string;
  developer_id: string;
  developer_email: string | null;
  is_published: boolean;
  avg_rating: number;
  rating_count: number;
  version_count: number;
  created_at: string;
}

export const pluginsApi = {
  list: (params: { published?: boolean; search?: string; limit?: number; offset?: number } = {}) =>
    api.get<PageOut<PluginAdminOut>>(`plugins${buildQs(params as Record<string, string | number | boolean | undefined>)}`),

  togglePublish: (slug: string, published: boolean) =>
    api.patch<void>(`plugins/${slug}/publish?published=${published}`),

  delete: (slug: string) =>
    api.del<void>(`plugins/${slug}`),
};

// ── Marketplace admin types (from marketplace/src/schemas/) ───────────────────

export interface CategoryOut {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface PluginVersionOut {
  id: string;
  version: string;
  anomaly_score: number;
  is_stable: boolean;
  is_yanked: boolean;
  yanked_reason: string | null;
  publish_status: string;
  changelog: string | null;
  merkle_root: string | null;
  created_at: string;
}

export interface PluginOut {
  id: string;
  developer_id: string;
  name: string;
  slug: string;
  description: string | null;
  homepage: string | null;
  repository: string | null;
  is_published: boolean;
  avg_rating: number;
  rating_count: number;
  download_count: number;
  latest_version: string | null;
  created_at: string;
  versions: PluginVersionOut[];
  categories: CategoryOut[];
}

export interface DeveloperOut {
  id: string;
  email: string;
  github_login: string | null;
  plugin_count: number;
}

export interface ContributorOut {
  login: string;
  contributions: number;
  avatar_url: string | null;
  html_url: string | null;
}

export const marketplaceApi = {
  getPlugin: (slug: string) =>
    xcoreFetch<PluginOut>(MARKETPLACE_BASE, `plugins/${slug}`, { method: "GET" }),

  yankVersion: (slug: string, version: string, reason?: string) => {
    const qs = reason ? `?reason=${encodeURIComponent(reason)}` : "";
    return api.post<void>(`plugins/${slug}/versions/${encodeURIComponent(version)}/yank${qs}`);
  },

  listDevelopers: (params: { limit?: number; offset?: number } = {}) =>
    api.get<PageOut<DeveloperOut>>(`plugins/developers${buildQs(params as Record<string, string | number | boolean | undefined>)}`),

  getDeveloperPlugins: (developerId: string) =>
    api.get<PluginAdminOut[]>(`plugins/developers/${developerId}/plugins`),

  getPluginContributors: (slug: string) =>
    api.get<ContributorOut[]>(`plugins/${slug}/contributors`),
};

// ── Submissions (/submissions) ────────────────────────────────────────────────

export type SubmissionStatus =
  | "pending"
  | "processing"
  | "approved"
  | "rejected"
  | "manual_review";

export interface SubmissionAdminOut {
  id: string;
  developer_id: string;
  developer_email: string | null;
  plugin_name: string;
  plugin_version: string;
  status: SubmissionStatus;
  source: string;
  anomaly_score: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface SetStatusResponse {
  submission_id: string;
  status: SubmissionStatus;
}

export const submissionsApi = {
  list: (params: {
    status?: SubmissionStatus;
    source?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}) =>
    api.get<PageOut<SubmissionAdminOut>>(
      `submissions${buildQs(params as Record<string, string | number | boolean | undefined>)}`
    ),

  setStatus: (submissionId: string, new_status: SubmissionStatus) =>
    api.patch<SetStatusResponse>(
      `submissions/${submissionId}/status?new_status=${new_status}`
    ),

  report: (submissionId: string) =>
    api.get<Record<string, unknown>>(`submissions/${submissionId}/report`),
};

// ── Categories (/categories) ──────────────────────────────────────────────────

export interface CategoryAdminOut {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  plugin_count: number | null;
}

export interface CategoryAdminCreate {
  name: string;
  description?: string;
}

export const categoriesApi = {
  list: () =>
    xcoreFetch<CategoryAdminOut[]>(MARKETPLACE_BASE, "categories", { method: "GET" }),

  create: (body: CategoryAdminCreate) =>
    xcoreFetch<CategoryAdminOut>(MARKETPLACE_BASE, "categories", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  delete: (slug: string) =>
    xcoreFetch<void>(MARKETPLACE_BASE, `categories/${slug}`, { method: "DELETE" }),
};

// ── Audit (/audit) ────────────────────────────────────────────────────────────

export interface AuditLogOut {
  id: string;
  user_id: string | null;
  action: string;
  resource: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export const auditApi = {
  list: (params: { user_id?: string; action?: string; limit?: number; offset?: number } = {}) =>
    api.get<AuditLogOut[]>(`audit${buildQs(params as Record<string, string | number | boolean | undefined>)}`),
};

// ── System (/system) ──────────────────────────────────────────────────────────

export interface SystemInfo {
  python: string;
  platform: string;
  pid: number;
  env: {
    APP_NAME: string;
    SANDBOX_MEMORY_MB: string | null;
    SANDBOX_CPU_SECONDS: string | null;
    CELERY_BROKER_URL: string;
    DATABASE_URL: string;
  };
}

export const systemApi = {
  info: () => api.get<SystemInfo>("system/info"),
  db:   () => api.get<Record<string, number | null>>("system/db"),
};

// ── RBAC (/app/auth/rbac/) ────────────────────────────────────────────────────

export interface PermissionResponse {
  id: string;
  name: string;
  description: string | null;
}

export interface RoleResponse {
  id: string;
  name: string;
  tenant_id: string | null;
  description: string | null;
  permissions: PermissionResponse[];
}

export interface RoleCreate {
  name: string;
  tenant_id?: string;
  description?: string;
}

export interface PermissionCreate {
  name: string;
  description?: string;
}

function rbacFetch<T>(path: string, options: RequestInit = {}) {
  return xcoreFetch<T>(XAUTH_BASE, `rbac/${path}`, options);
}

export const rbacApi = {
  listRoles: (tenant_id?: string) =>
    rbacFetch<RoleResponse[]>(`roles${tenant_id ? `?tenant_id=${encodeURIComponent(tenant_id)}` : ""}`),

  createRole: (body: RoleCreate) =>
    rbacFetch<RoleResponse>("roles", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  assignPermission: (roleId: string, permissionId: string) =>
    rbacFetch<RoleResponse>(`roles/${roleId}/permissions`, {
      method: "POST",
      body: JSON.stringify({ permission_id: permissionId }),
    }),

  removePermission: (roleId: string, permissionId: string) =>
    rbacFetch<RoleResponse>(`roles/${roleId}/permissions/${permissionId}`, {
      method: "DELETE",
    }),

  listPermissions: () =>
    rbacFetch<PermissionResponse[]>("permissions"),

  createPermission: (body: PermissionCreate) =>
    rbacFetch<PermissionResponse>("permissions", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  assignRoleToMember: (tenantId: string, userId: string, roleId: string) =>
    rbacFetch<{ success: boolean; role_id: string }>(
      `tenants/${tenantId}/members/${userId}/role`,
      { method: "POST", body: JSON.stringify({ role_id: roleId }) },
    ),

  getUserPermissions: (userId: string, tenantId: string) =>
    rbacFetch<string[]>(`users/${userId}/tenants/${tenantId}/permissions`),
};

// ── XPulse — SSE notifications (/app/XPulse/) ────────────────────────────────

const XPULSE_BASE = `${API_URL}/app/XPulse`;

export type XPulseChannel = "notification" | "admin" | "broadcast";

export interface XPulseMessage {
  event?: string;
  channel?: string;
  plugin_name?: string;
  plugin_version?: string;
  submission_id?: string;
  status?: string;
  anomaly_score?: number;
  text?: string;
  [key: string]: unknown;
}

export interface XPulseBroadcastResult {
  status: string;
  sent: number;
  channels: string[];
  errors: number;
}

export const xpulseApi = {
  /**
   * Opens a fetch-based SSE connection (supports Authorization header, unlike EventSource).
   * Returns a cleanup function — call it to close the stream.
   */
  connect(
    channels: XPulseChannel[],
    onMessage: (channel: string, data: XPulseMessage) => void,
    onError?: (err: Error) => void,
    onConnected?: () => void,
  ): () => void {
    if (typeof window === "undefined") return () => {};

    const qs = channels.map(c => `channels=${encodeURIComponent(c)}`).join("&");
    const url = `${XPULSE_BASE}/stream?${qs}`;
    const token = getCookie("admin_token");

    let active = true;
    const ctrl = new AbortController();

    (async () => {
      try {
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok || !res.body) {
          onError?.(new Error(`SSE ${res.status}`));
          return;
        }
        onConnected?.();
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let eventType = "message";
        while (active) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              try {
                const parsed = JSON.parse(line.slice(5).trim()) as XPulseMessage;
                onMessage(eventType, parsed);
              } catch { /* ignore non-JSON heartbeats */ }
              eventType = "message";
            }
          }
        }
      } catch (e) {
        if (active) onError?.(e as Error);
      }
    })();

    return () => {
      active = false;
      ctrl.abort();
    };
  },

  broadcast: (text: string, channels: string[] = ["admin", "broadcast"]) => {
    const qs = `text=${encodeURIComponent(text)}&${channels.map(c => `channels=${encodeURIComponent(c)}`).join("&")}`;
    return xcoreFetch<XPulseBroadcastResult>(XPULSE_BASE, `broadcast?${qs}`, { method: "POST" });
  },

  publish: (userId: string, text: string, channels: string[] = ["notification"]) => {
    const qs = `user_id=${encodeURIComponent(userId)}&text=${encodeURIComponent(text)}&${channels.map(c => `channels=${encodeURIComponent(c)}`).join("&")}`;
    return xcoreFetch<{ status: string; channels: string[] }>(XPULSE_BASE, `publish?${qs}`, { method: "POST" });
  },
};
