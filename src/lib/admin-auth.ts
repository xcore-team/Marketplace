/**
 * Admin auth helpers — client-side JWT decode + cookie management.
 * Real JWT verification happens server-side (FastAPI backend) on every API call.
 */

export interface AdminSession {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  exp: number;
  iat: number;
}

const COOKIE_NAME = "admin_token";

// ── Cookie helpers ─────────────────────────────────────────────────────────

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()!.split(";").shift() ?? null;
  return null;
}

export function getAdminToken(): string | null {
  return getCookie(COOKIE_NAME);
}

export function setAuthCookies(tokens: { access_token: string; refresh_token: string }): void {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `admin_token=${tokens.access_token}; path=/; SameSite=Strict; max-age=${60 * 60 * 8}${secure}`;
  document.cookie = `refresh_token=${tokens.refresh_token}; path=/; SameSite=Strict; max-age=${60 * 60 * 24 * 7}${secure}`;
}

export function clearAuthCookies(): void {
  if (typeof document === "undefined") return;
  document.cookie = "admin_token=; path=/; SameSite=Strict; max-age=0";
  document.cookie = "refresh_token=; path=/; SameSite=Strict; max-age=0";
}

/**
 * Decode the JWT payload without verifying signature.
 * The backend verifies on every request — this is display-only.
 */
export function decodeToken(token: string): AdminSession | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload.sub) return null;
    return {
      sub:         payload.sub,
      email:       payload.email ?? "",
      roles:       Array.isArray(payload.roles) ? payload.roles : [],
      permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
      exp:         payload.exp ?? 0,
      iat:         payload.iat ?? 0,
    };
  } catch {
    return null;
  }
}

export function getAdminSession(): AdminSession | null {
  const token = getAdminToken();
  if (!token) return null;
  const session = decodeToken(token);
  if (!session) return null;
  if (session.exp && session.exp < Math.floor(Date.now() / 1000)) return null;
  return session;
}

export function isLoggedIn(): boolean {
  return getAdminSession() !== null;
}

export function sessionExpiresIn(): string {
  const session = getAdminSession();
  if (!session) return "Expiré";
  const diff = session.exp * 1000 - Date.now();
  if (diff <= 0) return "Expiré";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
