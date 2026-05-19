import type {
  Category,
  PagedResponse,
  Plugin,
  PluginDoc,
  Rating,
  Submission,
  SubmissionReport,
  TokenResponse,
  User,
  Webhook,
} from '../types'

const BASE = ''  // proxied via Vite dev server; in prod, same origin

// ── Token storage ──────────────────────────────────────────────────────────────

export const getToken = () => localStorage.getItem('xc_token')
export const setToken = (t: string | null) =>
  t ? localStorage.setItem('xc_token', t) : localStorage.removeItem('xc_token')
export const getRefreshToken = () => localStorage.getItem('xc_refresh')
export const setRefreshToken = (t: string | null) =>
  t ? localStorage.setItem('xc_refresh', t) : localStorage.removeItem('xc_refresh')

// ── Core fetch ─────────────────────────────────────────────────────────────────

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'APIError'
  }
}

let _refreshing: Promise<string | null> | null = null

export async function tryRefresh(): Promise<string | null> {
  const rt = getRefreshToken()
  if (!rt) return null
  if (_refreshing) return _refreshing

  _refreshing = fetch(`${BASE}/app/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: rt }),
  })
    .then(async (r) => {
      if (!r.ok) { setToken(null); setRefreshToken(null); return null }
      const data: TokenResponse = await r.json()
      setToken(data.access_token)
      if (data.refresh_token) setRefreshToken(data.refresh_token)
      return data.access_token
    })
    .catch(() => { setToken(null); setRefreshToken(null); return null })
    .finally(() => { _refreshing = null })

  return _refreshing
}

async function call<T>(path: string, opts: RequestInit = {}, _retry = true): Promise<T> {
  const token = getToken()
  const isForm = opts.body instanceof FormData

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      ...(!isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  })

  // Auto-refresh on 401 if we have a refresh token
  if (res.status === 401 && _retry) {
    const newToken = await tryRefresh()
    if (newToken) return call<T>(path, opts, false)
  }

  if (!res.ok) {
    let msg = `Erreur ${res.status}`
    try {
      const j = await res.json()
      msg = j.detail ?? JSON.stringify(j)
    } catch {/* ignore */}
    throw new APIError(res.status, msg)
  }

  if (res.status === 204) return null as T
  return res.json() as Promise<T>
}

// ── Auth ───────────────────────────────────────────────────────────────────────

export const auth = {
  register: (email: string, password: string) =>
    call<User>('/app/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, tenant_slug: 'default' }),
    }),

  loginRaw: (email: string, password: string): Promise<TokenResponse> =>
    call<TokenResponse>('/app/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  login: async (email: string, password: string): Promise<User> => {
    const tokens = await call<TokenResponse>('/app/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    if (tokens.mfa_required) {
      throw Object.assign(new Error('MFA_REQUIRED'), { mfa_token: tokens.mfa_token })
    }
    setToken(tokens.access_token)
    setRefreshToken(tokens.refresh_token)
    return call<User>('/app/auth/me')
  },

  verifyMfaLogin: async (mfa_token: string, code: string): Promise<User> => {
    const tokens = await call<TokenResponse>('/app/auth/mfa/verify-login', {
      method: 'POST',
      body: JSON.stringify({ mfa_token, code }),
    })
    setToken(tokens.access_token)
    setRefreshToken(tokens.refresh_token)
    return call<User>('/app/auth/me')
  },

  logout: async () => {
    const refresh_token = getRefreshToken() ?? ''
    try {
      await call('/app/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token }),
      })
    } finally {
      setToken(null)
      setRefreshToken(null)
    }
  },

  me: () => call<User>('/app/auth/me'),

  oauthUrl: (provider: string) =>
    `/app/auth/oauth/${provider}/authorize?direct=true&redirect=${encodeURIComponent(window.location.origin + '/auth/callback')}`,
}

// ── Plugins ────────────────────────────────────────────────────────────────────

export const plugins = {
  list: (params: {
    limit?: number
    offset?: number
    search?: string
    category_id?: string
    sort?: string
  } = {}) => {
    const q = new URLSearchParams()
    if (params.limit) q.set('limit', String(params.limit))
    if (params.offset) q.set('offset', String(params.offset))
    if (params.search) q.set('search', params.search)
    if (params.category_id) q.set('category_id', params.category_id)
    if (params.sort) q.set('sort', params.sort)
    return call<PagedResponse<Plugin>>(`/app/marketplace/plugins?${q}`)
  },

  get: (slug: string) =>
    call<Plugin>(`/app/marketplace/plugins/${slug}`),

  mine: () =>
    call<Plugin[]>('/app/marketplace/plugins/me/plugins'),

  checkName: (name: string) =>
    call<{ available: boolean; slug: string }>(`/app/marketplace/plugins/check-name?name=${encodeURIComponent(name)}`),

  rate: (slug: string, score: number, comment?: string) =>
    call<Rating>(`/app/marketplace/plugins/${slug}/ratings`, {
      method: 'POST',
      body: JSON.stringify({ score, comment }),
    }),

  ratings: (slug: string) =>
    call<PagedResponse<Rating>>(`/app/marketplace/plugins/${slug}/ratings`),

  myRating: (slug: string) =>
    call<Rating>(`/app/marketplace/plugins/${slug}/ratings/me`),

  submissions: (slug: string) =>
    call<Submission[]>(`/app/marketplace/plugins/${slug}/submissions`),

  report: (submissionId: string) =>
    call<SubmissionReport>(`/app/marketplace/submissions/${submissionId}/report`),

  update: (slug: string, data: { description?: string; homepage?: string; repository?: string }) =>
    call<Plugin>(`/app/marketplace/plugins/${slug}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
}

// ── Webhooks ───────────────────────────────────────────────────────────────────

export const webhooks = {
  list: () => call<Webhook[]>('/app/marketplace/webhooks'),
  create: (data: { url: string; secret?: string; events?: string }) =>
    call<Webhook>('/app/marketplace/webhooks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  toggle: (id: string) =>
    call<Webhook>(`/app/marketplace/webhooks/${id}/toggle`, { method: 'PATCH' }),
  delete: (id: string) =>
    call(`/app/marketplace/webhooks/${id}`, { method: 'DELETE' }),
}

// ── MFA & Password ─────────────────────────────────────────────────────────────

export const mfa = {
  setup: () => call<{ secret: string; provisioning_uri: string; backup_codes: string[] }>('/app/auth/mfa/setup', { method: 'POST' }),
  enable: (code: string) => call<{ mfa_enabled: boolean }>('/app/auth/mfa/enable', { method: 'POST', body: JSON.stringify({ code }) }),
  verify: (code: string) => call<{ valid: boolean }>('/app/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ code }) }),
  disable: () => call('/app/auth/mfa', { method: 'DELETE' }),
}

export const password = {
  forgot: (email: string) => call('/app/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  reset: (data: { token: string; new_password: string }) => call('/app/auth/password/reset', { method: 'POST', body: JSON.stringify(data) }),
  change: (data: { current_password: string; new_password: string }) => call('/app/auth/password/change', { method: 'POST', body: JSON.stringify(data) }),
  set: (data: { new_password: string }) => call('/app/auth/password/set', { method: 'POST', body: JSON.stringify(data) }),
}

// ── Admin (xadmin) ────────────────────────────────────────────────────────────

export const admin = {
  // ── Stats & broadcast (xadmin, pas de sous-préfixe) ─────────────────────
  stats: () => call<any>('/app/xadmin/stats'),
  broadcast: (message: string) => call('/app/xadmin/broadcast', { method: 'POST', body: JSON.stringify({ message }) }),

  // ── Utilisateurs (xadmin /users) ─────────────────────────────────────────
  users: (params: any = {}) => call<PagedResponse<User>>(`/app/xadmin/users?${new URLSearchParams(params)}`),
  banUser: (id: string) => call<any>(`/app/xadmin/users/${id}/ban`, { method: 'PATCH' }),
  unbanUser: (id: string) => call<any>(`/app/xadmin/users/${id}/unban`, { method: 'PATCH' }),
  deleteUser: (id: string) => call(`/app/xadmin/users/${id}`, { method: 'DELETE' }),

  // ── Plugins (xadmin /plugins) ─────────────────────────────────────────────
  plugins: (params: any = {}) => call<PagedResponse<Plugin>>(`/app/xadmin/plugins?${new URLSearchParams(params)}`),
  updatePlugin: (slug: string, data: { is_published?: boolean; description?: string; category_ids?: string[] }) =>
    call<Plugin>(`/app/xadmin/plugins/${slug}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePlugin: (slug: string) => call(`/app/xadmin/plugins/${slug}`, { method: 'DELETE' }),
  yankVersion: (slug: string, version: string, reason: string) =>
    call<any>(`/app/xadmin/plugins/${slug}/versions/${version}/yank`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // ── Soumissions (xadmin /submissions) ────────────────────────────────────
  submissions: (params: any = {}) => call<PagedResponse<Submission>>(`/app/xadmin/submissions?${new URLSearchParams(params)}`),
  updateSubmissionStatus: (id: string, status: 'approved' | 'rejected' | 'manual_review' | 'pending') =>
    call<Submission>(`/app/xadmin/submissions/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // ── Catégories (xadmin /categories) ──────────────────────────────────────
  categoriesList: () => call<any[]>('/app/xadmin/categories'),
  categoryCreate: (data: { name: string; slug: string; description?: string }) =>
    call<any>('/app/xadmin/categories', { method: 'POST', body: JSON.stringify(data) }),
  categoryDelete: (id: string) =>
    call(`/app/xadmin/categories/${id}`, { method: 'DELETE' }),

  // ── Audit & système (xadmin /audit, /system) ──────────────────────────────
  audit: (params: any = {}) => call<any[]>(`/app/xadmin/audit?${new URLSearchParams(params)}`),
  systemInfo: () => call<any>('/app/xadmin/system/info'),
  systemDb: () => call<any>('/app/xadmin/system/db'),
}

// ── Categories ─────────────────────────────────────────────────────────────────

export const categories = {
  list: () => call<Category[] | PagedResponse<Category>>('/app/marketplace/categories'),
}

// ── GitHub ─────────────────────────────────────────────────────────────────────

export const github = {
  getLink: () => call<{ github_login: string; github_user_id: string; scopes: string | null; linked: boolean }>('/app/marketplace/github/link'),
  link: (access_token: string) =>
    call<{ github_login: string; linked: boolean }>('/app/marketplace/github/link', {
      method: 'POST',
      body: JSON.stringify({ access_token }),
    }),
  unlink: () => call('/app/marketplace/github/link', { method: 'DELETE' }),
  repos: (page = 1) =>
    call<Array<{
      id: number; name: string; full_name: string; description: string | null;
      private: boolean; default_branch: string; language: string | null;
      stargazers_count: number; updated_at: string; html_url: string;
    }>>(`/app/marketplace/github/repos?per_page=50&page=${page}&sort=updated`),
  publish: (data: { full_name: string; default_branch: string; plugin_version: string; category_ids?: string[] }) =>
    call<Submission>('/app/marketplace/github/publish', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  oauthToken: () => call<{ provider: string; token: string }>('/app/auth/oauth/me/token/github'),
}

// ── Docs (xdocs) ───────────────────────────────────────────────────────────────

export const docs = {
  get: (slug: string) =>
    call<PluginDoc>(`/app/xdocs/plugins/${slug}/docs`),
  getForVersion: (slug: string, version: string) =>
    call<PluginDoc>(`/app/xdocs/plugins/${slug}/versions/${version}/docs`),
}

// ── Submissions ────────────────────────────────────────────────────────────────

export const submissions = {
  list: () => call<Submission[]>('/app/marketplace/submissions'),

  get: (id: string) => call<Submission>(`/app/marketplace/submissions/${id}`),

  report: (id: string) => call<SubmissionReport>(`/app/marketplace/submissions/${id}/report`),

  submit: async (data: {
    file: File
    plugin_name: string
    plugin_version: string
    category_ids?: string[]
  }): Promise<Submission> => {
    const fd = new FormData()
    fd.append('file', data.file)
    fd.append('plugin_name', data.plugin_name)
    fd.append('plugin_version', data.plugin_version)
    if (data.category_ids?.length) {
      fd.append('category_ids', JSON.stringify(data.category_ids))
    }
    return call<Submission>('/app/marketplace/submissions', { method: 'POST', body: fd })
  },
}
