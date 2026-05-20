"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  usersApi, rbacApi, tenantsApi, type UserAdminOut, AdminApiError,
} from "@/lib/admin-api";
import {
  Search, RefreshCw, ChevronLeft, ChevronRight,
  UserX, UserCheck, Trash2, ShieldCheck, Shield, KeyRound,
} from "lucide-react";

const PAGE_SIZE = 50;

// ── Name hash → hue ───────────────────────────────────────────────────────────

function nameHue(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ email, active }: { email: string; active: boolean }) {
  const initials = email.slice(0, 2).toUpperCase();
  const hue = nameHue(email);
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center rounded"
      style={{
        width: 28,
        height: 28,
        background: `hsla(${hue},40%,18%,1)`,
        border: `1px solid hsla(${hue},40%,38%,0.45)`,
        color: `hsla(${hue},55%,72%,1)`,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.03em",
        opacity: active ? 1 : 0.45,
      }}
    >
      {initials}
    </div>
  );
}

// ── Activity inline ───────────────────────────────────────────────────────────

function ActivityInline({ plugins, submissions }: { plugins: number; submissions: number }) {
  return (
    <span
      title={`${plugins} plugins · ${submissions} soumissions`}
      style={{
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 11,
        color: "var(--text-3)",
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: plugins > 0 ? "var(--xcore)" : "var(--text-3)" }}>{plugins}P</span>
      <span style={{ color: "var(--border-2)" }}> · </span>
      <span style={{ color: submissions > 0 ? "var(--signal-pending)" : "var(--text-3)" }}>{submissions}S</span>
    </span>
  );
}

// ── Column header ─────────────────────────────────────────────────────────────

function ColHead({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={className}
      style={{
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--text-3)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div
      className="flex items-center gap-4 px-4"
      style={{
        height: 52,
        borderBottom: "1px solid var(--border)",
        borderLeft: "2px solid var(--surface-2)",
      }}
    >
      <div className="skeleton flex-shrink-0 rounded" style={{ width: 28, height: 28 }} />
      <div className="flex-1 space-y-1.5">
        <div className="skeleton h-3 rounded" style={{ width: 180 }} />
        <div className="skeleton h-2.5 rounded" style={{ width: 110 }} />
      </div>
      <div className="skeleton h-4 rounded" style={{ width: 60 }} />
      <div className="skeleton h-4 rounded" style={{ width: 40 }} />
      <div className="skeleton h-4 rounded" style={{ width: 44 }} />
      <div className="skeleton h-3 rounded" style={{ width: 56 }} />
      <div className="skeleton h-6 rounded" style={{ width: 120 }} />
    </div>
  );
}

// ── Confirm delete modal ──────────────────────────────────────────────────────

function ConfirmDeleteModal({
  user,
  onConfirm,
  onCancel,
  busy,
}: {
  user: UserAdminOut;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
    >
      <div
        className="panel p-6 w-full max-w-sm mx-4 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}
          >
            <Trash2 className="w-4 h-4" style={{ color: "var(--signal-danger)" }} />
          </div>
          <div>
            <div className="text-sm font-semibold mb-0.5" style={{ color: "var(--text-1)" }}>
              Supprimer l'utilisateur
            </div>
            <div className="text-xs" style={{ color: "var(--text-3)" }}>
              Cette action est irréversible.
            </div>
          </div>
        </div>

        <div
          className="rounded-lg px-3 py-2 text-xs font-mono truncate"
          style={{ background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--border)" }}
        >
          {user.email}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onConfirm}
            disabled={busy}
            className="btn-danger flex-1 justify-center py-2 text-sm"
          >
            {busy
              ? <span className="w-3.5 h-3.5 rounded-full border-2 animate-spin inline-block" style={{ borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
              : "Supprimer définitivement"
            }
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="btn-ghost flex-1 justify-center py-2 text-sm"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

// ── User row ──────────────────────────────────────────────────────────────────

function UserRow({
  user,
  onUpdated,
  onDeleted,
  onDeleteRequest,
  adminRoleId,
  defaultTenantId,
}: {
  user: UserAdminOut;
  onUpdated: (u: UserAdminOut) => void;
  onDeleted: (id: string) => void;
  onDeleteRequest: (u: UserAdminOut) => void;
  adminRoleId: string | null;
  defaultTenantId: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);
  const active  = user.is_active;
  const isAdmin = user.roles.some(r => r.includes("admin"));

  async function toggleBan() {
    setBusy(true); setErr(null);
    try {
      if (active) {
        await usersApi.ban(user.id, { reason: "Banni par admin" });
        onUpdated({ ...user, is_active: false });
      } else {
        await usersApi.unban(user.id);
        onUpdated({ ...user, is_active: true });
      }
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally { setBusy(false); }
  }


  async function promoteToAdmin() {
    if (!adminRoleId || !defaultTenantId) return;
    setBusy(true); setErr(null);
    try {
      await usersApi.assignRole(user.id, { role_id: adminRoleId, tenant_id: defaultTenantId });
      const updated = await usersApi.get(user.id);
      onUpdated(updated);
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally { setBusy(false); }
  }

  const joined = new Date(user.created_at).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "2-digit",
  });

  return (
    <div
      className="relative flex items-center gap-4 px-4 transition-colors group/row"
      style={{
        height: 52,
        borderBottom: "1px solid var(--border)",
        borderLeft: `2px solid ${active ? "transparent" : "var(--signal-danger)"}`,
        background: active
          ? "transparent"
          : "rgba(239,68,68,0.04)",
        opacity: busy ? 0.55 : 1,
      }}
    >
      {/* Hover highlight */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover/row:opacity-100 transition-opacity"
        style={{ background: "rgba(255,255,255,0.018)" }}
      />

      {/* Avatar */}
      <Avatar email={user.email} active={active} />

      {/* Email + ID */}
      <div className="flex-1 min-w-0">
        <Link href={`/users/${user.id}`} className="group/link flex items-center gap-1.5">
          <span
            className="truncate group-hover/link:underline"
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: !active
                ? "var(--text-2)"
                : isAdmin
                ? "var(--xcore-mint)"
                : "var(--text-1)",
              maxWidth: 280,
              display: "block",
            }}
          >
            {user.email}
          </span>
          {isAdmin && (
            <ShieldCheck
              className="w-3 h-3 flex-shrink-0"
              style={{ color: "var(--xcore)" }}
            />
          )}
        </Link>
        <span
          className="mono-value"
          style={{
            fontSize: 10,
            color: "var(--text-3)",
            display: "block",
            maxWidth: 120,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            marginTop: 1,
          }}
        >
          {user.id.slice(0, 12)}…
        </span>
      </div>

      {/* Roles */}
      <div className="flex items-center gap-1 flex-shrink-0" style={{ minWidth: 90 }}>
        {user.roles.length === 0 ? (
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--text-3)" }}>—</span>
        ) : (
          user.roles.map(role => (
            <span
              key={role}
              className="inline-flex items-center gap-0.5 px-1.5 rounded"
              style={{
                height: 18,
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10,
                fontWeight: 600,
                background: isAdmin ? "var(--xcore-dim)" : "rgba(255,255,255,0.06)",
                color: isAdmin ? "var(--xcore)" : "var(--text-3)",
                border: `1px solid ${isAdmin ? "var(--xcore-glow)" : "var(--border)"}`,
                whiteSpace: "nowrap",
              }}
            >
              {isAdmin
                ? <ShieldCheck className="w-2.5 h-2.5" />
                : <Shield className="w-2.5 h-2.5" />
              }
              {role}
            </span>
          ))
        )}
      </div>

      {/* Activity */}
      <div className="flex-shrink-0" style={{ minWidth: 56, textAlign: "right" }}>
        <ActivityInline plugins={user.plugin_count} submissions={user.submission_count} />
      </div>

      {/* MFA */}
      <div className="flex-shrink-0" style={{ minWidth: 44, textAlign: "center" }}>
        <span
          className="inline-flex items-center gap-1 px-1.5 rounded"
          style={{
            height: 18,
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10,
            fontWeight: 700,
            background: user.mfa_enabled ? "rgba(0,200,150,0.1)" : "rgba(255,255,255,0.04)",
            color: user.mfa_enabled ? "var(--signal-ok)" : "var(--text-3)",
            border: `1px solid ${user.mfa_enabled ? "rgba(0,200,150,0.3)" : "var(--border)"}`,
          }}
        >
          <KeyRound className="w-2.5 h-2.5" />
          {user.mfa_enabled ? "2FA" : "—"}
        </span>
      </div>

      {/* Joined */}
      <div
        className="flex-shrink-0 mono-value text-right"
        style={{ minWidth: 72, fontSize: 10, color: "var(--text-3)" }}
      >
        {joined}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {err && (
          <span
            style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--signal-danger)", marginRight: 4 }}
          >
            {err}
          </span>
        )}

        {/* Promote to admin */}
        {!isAdmin && adminRoleId && defaultTenantId && (
          <button
            onClick={promoteToAdmin}
            disabled={busy}
            title="Promouvoir administrateur"
            className="btn-xs btn-ghost"
            style={{ color: "var(--xcore)", display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            <ShieldCheck className="w-3 h-3" />
          </button>
        )}

        {/* Ban / unban */}
        <button
          onClick={toggleBan}
          disabled={busy}
          title={active ? "Bannir cet utilisateur" : "Débannir cet utilisateur"}
          className={active ? "btn-xs btn-warn" : "btn-xs btn-success"}
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          {active
            ? <UserX className="w-3 h-3" />
            : <UserCheck className="w-3 h-3" />
          }
          <span style={{ fontFamily: "JetBrains Mono, monospace" }}>
            {active ? "ban" : "unban"}
          </span>
        </button>

        {/* Delete */}
        <button
          onClick={() => onDeleteRequest(user)}
          disabled={busy}
          title="Supprimer définitivement"
          className="btn-xs btn-ghost"
          style={{ color: "var(--signal-danger)", display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const [users,           setUsers]           = useState<UserAdminOut[]>([]);
  const [total,           setTotal]           = useState(0);
  const [loading,         setLoading]         = useState(true);
  const [offset,          setOffset]          = useState(0);
  const [search,          setSearch]          = useState("");
  const [filter,          setFilter]          = useState<"" | "active" | "banned">("");
  const [adminRoleId,     setAdminRoleId]     = useState<string | null>(null);
  const [defaultTenantId, setDefaultTenantId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserAdminOut | null>(null);
  const [deleteBusy,   setDeleteBusy]   = useState(false);

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await usersApi.delete(deleteTarget.id);
      setUsers(prev => prev.filter(x => x.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setDeleteBusy(false);
    }
  }

  useEffect(() => {
    async function loadMeta() {
      try {
        const [roles, tenants] = await Promise.all([rbacApi.listRoles(), tenantsApi.list()]);
        const adminRole = roles.find(r => r.name === "admin");
        const defaultTenant = tenants.find(t => t.slug === "default") ?? tenants[0];
        if (adminRole) setAdminRoleId(adminRole.id);
        if (defaultTenant) setDefaultTenantId(defaultTenant.id);
      } catch { /* promote button stays disabled */ }
    }
    loadMeta();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { search?: string; is_active?: boolean; limit: number; offset: number } = {
        limit: PAGE_SIZE, offset,
      };
      if (search) params.search = search;
      if (filter === "active") params.is_active = true;
      if (filter === "banned") params.is_active = false;
      const res = await usersApi.list(params);
      setUsers(res.items);
      setTotal(res.total);
    } catch {
      setUsers([]);
    } finally { setLoading(false); }
  }, [offset, search, filter]);

  useEffect(() => { load(); }, [load]);

  const page       = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const activeCount = users.filter(u => u.is_active).length;
  const bannedCount = users.filter(u => !u.is_active).length;

  // Filter chips config
  const chips = [
    { value: "" as const,       label: "All",     count: null,        accentColor: "var(--text-2)" },
    { value: "active" as const, label: "Active",  count: activeCount, accentColor: "var(--signal-ok)" },
    { value: "banned" as const, label: "Banned",  count: bannedCount, accentColor: "var(--signal-danger)" },
  ];

  return (
    <div>

      {deleteTarget && (
        <ConfirmDeleteModal
          user={deleteTarget}
          busy={deleteBusy}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* ── Sticky page header ─────────────────────────────────────────────── */}
      <div className="page-header" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="page-title">Users</h1>
            <span
              className="mono-value"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--xcore)",
                background: "var(--xcore-dim)",
                border: "1px solid var(--xcore-glow)",
                borderRadius: 4,
                padding: "2px 7px",
              }}
            >
              {loading ? "…" : total.toLocaleString()}
            </span>
          </div>
          <button onClick={load} disabled={loading} className="btn-ghost btn-sm" title="Rafraîchir">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2">
          <div className="filter-bar">
            {chips.map(chip => {
              const isActive = filter === chip.value;
              return (
                <button
                  key={chip.value}
                  onClick={() => { setFilter(chip.value); setOffset(0); }}
                  className={`filter-chip${isActive ? " active" : ""}`}
                  style={isActive ? { borderColor: chip.accentColor, color: chip.accentColor } : undefined}
                >
                  {chip.label}
                  {chip.count !== null && !loading && (
                    <span style={{ opacity: 0.65, marginLeft: 4 }}>{chip.count}</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="relative flex-1" style={{ minWidth: 180 }}>
            <Search className="absolute top-1/2 -translate-y-1/2" style={{ left: 9, width: 12, height: 12, color: "var(--text-3)" }} />
            <input
              type="text"
              placeholder="search by email…"
              value={search}
              onChange={e => { setSearch(e.target.value); setOffset(0); }}
              className="input w-full"
              style={{ paddingLeft: 28, fontSize: 12, height: 30 }}
            />
          </div>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="page-content">
        <div className="panel overflow-hidden">
          {/* Column headers */}
          <div
            className="flex items-center gap-4 px-4"
            style={{
              height: 36,
              borderBottom: "1px solid var(--border)",
              background: "var(--surface-2)",
            }}
          >
            <div style={{ width: 28, flexShrink: 0 }} />
            <ColHead className="flex-1">Email · ID</ColHead>
            <ColHead style={{ minWidth: 90 }}>Roles</ColHead>
            <ColHead style={{ minWidth: 56, textAlign: "right" }}>Activity</ColHead>
            <ColHead style={{ minWidth: 44, textAlign: "center" }}>MFA</ColHead>
            <ColHead style={{ minWidth: 72, textAlign: "right" }}>Joined</ColHead>
            <ColHead style={{ minWidth: 140, textAlign: "right" }}>Actions</ColHead>
          </div>

          {/* Rows */}
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
            : users.map(u => (
                <UserRow
                  key={u.id}
                  user={u}
                  onUpdated={updated => setUsers(prev => prev.map(x => x.id === updated.id ? updated : x))}
                  onDeleted={id => setUsers(prev => prev.filter(x => x.id !== id))}
                  onDeleteRequest={setDeleteTarget}
                  adminRoleId={adminRoleId}
                  defaultTenantId={defaultTenantId}
                />
              ))
          }

          {/* Empty state */}
          {!loading && users.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16">
              <span className="mono-value" style={{ fontSize: 12, color: "var(--text-3)" }}>
                no users found
              </span>
              {search && (
                <span className="mono-value mt-1.5" style={{ fontSize: 10, color: "var(--text-3)", opacity: 0.6 }}>
                  query: &quot;{search}&quot;
                </span>
              )}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3">
            <span className="mono-value" style={{ fontSize: 11, color: "var(--text-3)" }}>
              pg {page}/{totalPages} · {total.toLocaleString()} users
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
                disabled={offset === 0}
                className="btn-outline btn-sm"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setOffset(o => o + PAGE_SIZE)}
                disabled={page >= totalPages}
                className="btn-outline btn-sm"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
