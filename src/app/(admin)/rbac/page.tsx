"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  rbacApi, usersApi, tenantsApi,
  type RoleResponse, type PermissionResponse,
  type RoleCreate, type PermissionCreate,
  type UserAdminOut, type TenantResponse,
  AdminApiError,
} from "@/lib/admin-api";
import {
  RefreshCw, Plus, X, Check,
  ChevronDown, ChevronRight,
  Lock, Shield, ShieldCheck, Loader2, AlertTriangle,
  Zap, KeyRound, UserCog, Search,
} from "lucide-react";

// ── Permission badge ───────────────────────────────────────────────────────────

function PermBadge({
  perm,
  onRemove,
  removing,
  variant = "default",
}: {
  perm: PermissionResponse;
  onRemove?: () => void;
  removing?: boolean;
  variant?: "default" | "compact";
}) {
  const isWild = perm.name.includes("*");
  return (
    <span
      className={`inline-flex items-center gap-1 rounded font-semibold mono-value transition-all ${
        variant === "compact" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[10px]"
      }`}
      style={{
        background: isWild ? "var(--signal-danger-dim)" : "var(--xcore-dim)",
        color:      isWild ? "#D07070"                   : "var(--xcore)",
        border:     `1px solid ${isWild ? "var(--signal-danger-border)" : "var(--signal-ok-border)"}`,
      }}
    >
      {isWild && <Zap className="w-2.5 h-2.5 flex-shrink-0" />}
      {perm.name}
      {onRemove && (
        <button
          onClick={onRemove}
          disabled={removing}
          className="ml-0.5 opacity-40 hover:opacity-100 transition-opacity rounded-sm"
          aria-label={`Retirer ${perm.name}`}
        >
          {removing
            ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
            : <X className="w-2.5 h-2.5" />}
        </button>
      )}
    </span>
  );
}

// ── Role card ──────────────────────────────────────────────────────────────────

function RoleCard({
  role,
  allPerms,
  onUpdated,
  isLast,
}: {
  role: RoleResponse;
  allPerms: PermissionResponse[];
  onUpdated: (r: RoleResponse) => void;
  isLast?: boolean;
}) {
  const [expanded,     setExpanded]   = useState(false);
  const [addingPerm,   setAddingPerm] = useState(false);
  const [selectedPerm, setSelected]   = useState("");
  const [busy,         setBusy]       = useState(false);
  const [removingId,   setRemovingId] = useState<string | null>(null);
  const [err,          setErr]        = useState<string | null>(null);

  const assignedIds = new Set(role.permissions.map(p => p.id));
  const available   = allPerms.filter(p => !assignedIds.has(p.id));
  const hasWild     = role.permissions.some(p => p.name.includes("*"));
  const isAdmin     = role.name.includes("admin") || role.name.includes("super");
  const isTenant    = !!role.tenant_id;

  async function handleAddPerm() {
    if (!selectedPerm) return;
    setBusy(true); setErr(null);
    try {
      const updated = await rbacApi.assignPermission(role.id, selectedPerm);
      onUpdated(updated);
      setSelected(""); setAddingPerm(false);
    } catch (e) { setErr(e instanceof AdminApiError ? e.message : "Erreur"); }
    finally { setBusy(false); }
  }

  async function handleRemovePerm(permId: string) {
    setRemovingId(permId); setErr(null);
    try {
      const updated = await rbacApi.removePermission(role.id, permId);
      onUpdated(updated);
    } catch (e) { setErr(e instanceof AdminApiError ? e.message : "Erreur"); }
    finally { setRemovingId(null); }
  }

  return (
    <div
      className="transition-all"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--border)",
      }}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left group hover:bg-white/[0.018] transition-colors"
      >
        {/* Icon */}
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
          style={{
            background: isAdmin ? "var(--xcore-dim)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${isAdmin ? "var(--signal-ok-border)" : "var(--border)"}`,
          }}
        >
          {isAdmin
            ? <ShieldCheck className="w-3 h-3" style={{ color: "var(--xcore)" }} />
            : <Shield className="w-3 h-3" style={{ color: "var(--text-3)" }} />}
        </div>

        {/* Name + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="font-semibold text-[13px] mono-value"
              style={{ color: "var(--text-1)", fontFamily: "'JetBrains Mono', monospace" }}
            >
              {role.name}
            </span>
            {hasWild && (
              <span className="badge badge-xcore" style={{ fontSize: "9px", padding: "1px 6px" }}>
                <Zap className="w-2 h-2" /> admin:*
              </span>
            )}
            {isTenant && (
              <span className="badge badge-blue" style={{ fontSize: "9px", padding: "1px 6px" }}>
                tenant
              </span>
            )}
          </div>
          {role.description && (
            <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-3)" }}>
              {role.description}
            </div>
          )}
        </div>

        {/* Perm count + chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="mono-value text-[11px] px-2 py-0.5 rounded"
            style={{
              background: "var(--surface-3)",
              color: role.permissions.length > 0 ? "var(--text-2)" : "var(--text-3)",
            }}
          >
            {role.permissions.length}
          </span>
          {expanded
            ? <ChevronDown  className="w-3.5 h-3.5" style={{ color: "var(--xcore)" }} />
            : <ChevronRight className="w-3.5 h-3.5 transition-colors" style={{ color: "var(--text-3)" }} />}
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div
          className="px-4 pb-4 pt-3 space-y-3 animate-slide-up"
          style={{ borderTop: "1px solid var(--border)", background: "rgba(0,200,150,0.012)" }}
        >
          {err && (
            <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--signal-danger)" }}>
              <AlertTriangle className="w-3 h-3" />{err}
            </p>
          )}

          {/* Permission chips */}
          <div className="flex flex-wrap gap-1.5 min-h-[22px]">
            {role.permissions.length > 0
              ? role.permissions.map(p => (
                  <PermBadge
                    key={p.id}
                    perm={p}
                    onRemove={() => handleRemovePerm(p.id)}
                    removing={removingId === p.id}
                  />
                ))
              : <span className="text-[11px] italic" style={{ color: "var(--text-3)" }}>
                  Aucune permission assignée
                </span>
            }
          </div>

          {/* Add permission */}
          {addingPerm ? (
            <div className="flex items-center gap-2">
              <select
                value={selectedPerm}
                onChange={e => setSelected(e.target.value)}
                className="input py-1 text-xs mono-value flex-1"
                style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px" }}
                autoFocus
              >
                <option value="">— Choisir —</option>
                {available.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                onClick={handleAddPerm}
                disabled={busy || !selectedPerm}
                className="btn-primary btn-xs"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              </button>
              <button
                onClick={() => { setAddingPerm(false); setSelected(""); setErr(null); }}
                className="btn-ghost btn-xs"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingPerm(true)}
              disabled={available.length === 0}
              className="btn-ghost btn-xs"
              style={{ fontSize: "11px" }}
            >
              <Plus className="w-3 h-3" />
              {available.length === 0 ? "Toutes assignées" : "Ajouter permission"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Permission registry (right panel) ─────────────────────────────────────────

function PermissionRegistry({
  permissions,
  roles,
  loading,
}: {
  permissions: PermissionResponse[];
  roles: RoleResponse[];
  loading: boolean;
}) {
  const groups = permissions.reduce<Record<string, PermissionResponse[]>>((acc, p) => {
    const prefix = p.name.includes(":") ? p.name.split(":")[0] : "global";
    (acc[prefix] ??= []).push(p);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="space-y-0">
        {/* Fake group header */}
        <div className="px-4 py-2" style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
          <div className="skeleton h-2.5 rounded w-16" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="skeleton h-2.5 rounded w-32" />
            <div className="skeleton h-2.5 rounded w-6 ml-auto" />
          </div>
        ))}
      </div>
    );
  }

  if (permissions.length === 0) {
    return (
      <div className="py-12 text-center space-y-2">
        <KeyRound className="w-7 h-7 mx-auto opacity-20" style={{ color: "var(--text-3)" }} />
        <p className="text-xs" style={{ color: "var(--text-3)" }}>Aucune permission</p>
      </div>
    );
  }

  const prefixColors: Record<string, string> = {
    admin:  "var(--xcore)",
    plugin: "var(--signal-pending)",
    user:   "var(--xcore-mint)",
    tenant: "var(--signal-warn)",
  };

  return (
    <div>
      {Object.entries(groups).map(([prefix, perms], gi) => (
        <div key={prefix}>
          {/* Group header */}
          <div
            className="px-4 py-1.5 flex items-center gap-2"
            style={{
              background: "var(--surface-2)",
              borderTop:    gi > 0 ? "1px solid var(--border)" : undefined,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span
              className="w-1 h-1 rounded-full flex-shrink-0"
              style={{ background: prefixColors[prefix] ?? "var(--text-3)" }}
            />
            <span className="cmd-label" style={{ color: prefixColors[prefix] ?? "var(--text-3)" }}>
              {prefix}
            </span>
            <span className="mono-value ml-auto" style={{ fontSize: "10px", color: "var(--text-3)" }}>
              {perms.length}
            </span>
          </div>

          {/* Permission rows */}
          {perms.map((perm, pi) => {
            const usedBy = roles.filter(r => r.permissions.some(p => p.id === perm.id));
            const isWild = perm.name.includes("*");
            return (
              <div
                key={perm.id}
                className="px-4 py-2.5 flex items-center justify-between gap-3 group transition-colors hover:bg-white/[0.016]"
                style={{
                  borderBottom: pi < perms.length - 1 ? "1px solid var(--border)" : "none",
                  borderLeft: `2px solid ${isWild ? "var(--signal-danger)" : "transparent"}`,
                }}
              >
                <div className="min-w-0">
                  <div
                    className="mono-value text-[11px] font-semibold flex items-center gap-1"
                    style={{ color: isWild ? "#D07070" : "var(--text-2)" }}
                  >
                    {isWild && <Zap className="w-2.5 h-2.5 flex-shrink-0" style={{ color: "#D07070" }} />}
                    {perm.name}
                  </div>
                  {perm.description && (
                    <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--text-3)" }}>
                      {perm.description}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {isWild && (
                    <span className="badge badge-red" style={{ fontSize: "9px", padding: "1px 5px" }}>
                      wildcard
                    </span>
                  )}
                  {usedBy.length > 0 ? (
                    <span
                      className="mono-value text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: "var(--surface-3)", color: "var(--text-2)" }}
                    >
                      {usedBy.length}r
                    </span>
                  ) : (
                    <span className="mono-value text-[10px]" style={{ color: "var(--text-3)" }}>—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Assign role panel ─────────────────────────────────────────────────────────

function AssignRolePanel({
  roles,
  tenants,
}: {
  roles: RoleResponse[];
  tenants: TenantResponse[];
}) {
  const [query,      setQuery]      = useState("");
  const [results,    setResults]    = useState<UserAdminOut[]>([]);
  const [searching,  setSearching]  = useState(false);
  const [selected,   setSelected]   = useState<UserAdminOut | null>(null);
  const [roleId,     setRoleId]     = useState("");
  const [tenantId,   setTenantId]   = useState(tenants[0]?.id ?? "");
  const [busy,       setBusy]       = useState(false);
  const [err,        setErr]        = useState<string | null>(null);
  const [success,    setSuccess]    = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleSearch(v: string) {
    setQuery(v);
    setSelected(null);
    setErr(null);
    setSuccess(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!v.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const page = await usersApi.list({ search: v.trim(), limit: 6 });
        setResults(page.items);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 320);
  }

  function selectUser(u: UserAdminOut) {
    setSelected(u);
    setQuery(u.email);
    setResults([]);
    setErr(null);
    setSuccess(null);
  }

  async function handleAssign() {
    if (!selected || !roleId || !tenantId) { setErr("Remplis tous les champs"); return; }
    setBusy(true); setErr(null); setSuccess(null);
    try {
      await rbacApi.assignRoleToMember(tenantId, selected.id, roleId);
      const roleName = roles.find(r => r.id === roleId)?.name ?? roleId;
      setSuccess(`Rôle "${roleName}" assigné à ${selected.email}`);
      setSelected(null);
      setQuery("");
      setRoleId("");
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally { setBusy(false); }
  }

  return (
    <div
      className="panel p-5 space-y-4 animate-slide-up"
      style={{ borderColor: "var(--xcore-glow)", borderStyle: "dashed" }}
    >
      <div className="flex items-center gap-2">
        <UserCog className="w-3.5 h-3.5" style={{ color: "var(--xcore)" }} />
        <span className="cmd-label" style={{ color: "var(--xcore)" }}>Assigner un rôle</span>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr auto" }}>

        {/* User search */}
        <div className="relative">
          <label className="block text-[10px] mb-1.5 cmd-label">Utilisateur</label>
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
              style={{ color: "var(--text-3)" }}
            />
            <input
              type="text"
              value={query}
              onChange={e => handleSearch(e.target.value)}
              className="input text-xs pl-7"
              placeholder="Rechercher par email…"
              autoComplete="off"
            />
            {searching && (
              <Loader2
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 animate-spin"
                style={{ color: "var(--text-3)" }}
              />
            )}
          </div>
          {results.length > 0 && (
            <div
              className="absolute z-20 w-full mt-1 rounded-lg overflow-hidden"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}
            >
              {results.map(u => (
                <button
                  key={u.id}
                  onClick={() => selectUser(u)}
                  className="w-full px-3 py-2 text-left hover:bg-white/[0.04] transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs truncate" style={{ color: "var(--text-1)" }}>{u.email}</div>
                    {u.roles.length > 0 && (
                      <div className="text-[10px] mono-value truncate mt-0.5" style={{ color: "var(--text-3)" }}>
                        {u.roles.join(", ")}
                      </div>
                    )}
                  </div>
                  <span
                    className="text-[10px] flex-shrink-0 px-1.5 py-0.5 rounded"
                    style={{
                      background: u.is_active ? "var(--signal-ok-dim)" : "var(--signal-danger-dim)",
                      color:      u.is_active ? "var(--signal-ok)"     : "var(--signal-danger)",
                    }}
                  >
                    {u.is_active ? "actif" : "banni"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Role select */}
        <div>
          <label className="block text-[10px] mb-1.5 cmd-label">Rôle</label>
          <select
            value={roleId}
            onChange={e => setRoleId(e.target.value)}
            className="input text-xs mono-value"
            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px" }}
          >
            <option value="">— Choisir un rôle —</option>
            {roles.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        {/* Tenant select */}
        <div>
          <label className="block text-[10px] mb-1.5 cmd-label">Tenant</label>
          <select
            value={tenantId}
            onChange={e => setTenantId(e.target.value)}
            className="input text-xs mono-value"
            style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px" }}
          >
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
            ))}
          </select>
        </div>

        {/* Submit */}
        <div className="flex items-end">
          <button
            onClick={handleAssign}
            disabled={busy || !selected || !roleId || !tenantId}
            className="btn-primary btn-sm whitespace-nowrap"
          >
            {busy
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Check className="w-3.5 h-3.5" />}
            Assigner
          </button>
        </div>
      </div>

      {err && (
        <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--signal-danger)" }}>
          <AlertTriangle className="w-3 h-3" />{err}
        </p>
      )}
      {success && (
        <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--signal-ok)" }}>
          <Check className="w-3 h-3" />{success}
        </p>
      )}
    </div>
  );
}

// ── Stat tile ──────────────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  accent?: "green" | "amber" | "red" | "blue" | "neutral";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const accentColor = {
    green:   "var(--xcore)",
    amber:   "var(--signal-warn)",
    red:     "var(--signal-danger)",
    blue:    "var(--signal-pending)",
    neutral: "var(--text-3)",
  }[accent ?? "neutral"];

  return (
    <div
      className="flex items-center gap-3 px-5 py-3 flex-1"
      style={{ borderRight: "1px solid var(--border)" }}
    >
      {Icon && (
        <Icon className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
      )}
      <div>
        <div
          className="mono-value font-semibold"
          style={{ color: accentColor, fontSize: "15px", fontFamily: "'JetBrains Mono', monospace" }}
        >
          {value}
        </div>
        <div className="cmd-label mt-0.5" style={{ fontSize: "9px" }}>{label}</div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function RBACPage() {
  const [roles,       setRoles]       = useState<RoleResponse[]>([]);
  const [permissions, setPermissions] = useState<PermissionResponse[]>([]);
  const [tenants,     setTenants]     = useState<TenantResponse[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadErr,     setLoadErr]     = useState<string | null>(null);
  const [showAssign,  setShowAssign]  = useState(false);

  // Create role
  const [showRole,   setShowRole]   = useState(false);
  const [roleName,   setRoleName]   = useState("");
  const [roleDesc,   setRoleDesc]   = useState("");
  const [roleTenant, setRoleTenant] = useState("");
  const [busyRole,   setBusyRole]   = useState(false);
  const [errRole,    setErrRole]    = useState<string | null>(null);

  // Create permission
  const [showPerm, setShowPerm] = useState(false);
  const [permName, setPermName] = useState("");
  const [permDesc, setPermDesc] = useState("");
  const [busyPerm, setBusyPerm] = useState(false);
  const [errPerm,  setErrPerm]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadErr(null);
    try {
      const [r, p, t] = await Promise.all([
        rbacApi.listRoles(),
        rbacApi.listPermissions(),
        tenantsApi.list(),
      ]);
      setRoles(r); setPermissions(p); setTenants(t);
    } catch (e) {
      setLoadErr(e instanceof AdminApiError ? e.message : "Impossible de charger les données RBAC");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreateRole() {
    if (!roleName.trim()) { setErrRole("Nom requis"); return; }
    setBusyRole(true); setErrRole(null);
    try {
      const body: RoleCreate = { name: roleName.trim() };
      if (roleDesc.trim())   body.description = roleDesc.trim();
      if (roleTenant.trim()) body.tenant_id   = roleTenant.trim();
      const created = await rbacApi.createRole(body);
      setRoles(prev => [...prev, created]);
      setRoleName(""); setRoleDesc(""); setRoleTenant("");
      setShowRole(false);
    } catch (e) { setErrRole(e instanceof AdminApiError ? e.message : "Erreur"); }
    finally { setBusyRole(false); }
  }

  async function handleCreatePermission() {
    if (!permName.trim()) { setErrPerm("Nom requis"); return; }
    setBusyPerm(true); setErrPerm(null);
    try {
      const body: PermissionCreate = { name: permName.trim() };
      if (permDesc.trim()) body.description = permDesc.trim();
      const created = await rbacApi.createPermission(body);
      setPermissions(prev => [...prev, created]);
      setPermName(""); setPermDesc("");
      setShowPerm(false);
    } catch (e) { setErrPerm(e instanceof AdminApiError ? e.message : "Erreur"); }
    finally { setBusyPerm(false); }
  }

  const wildcardCount = permissions.filter(p => p.name.includes("*")).length;
  const unassigned    = permissions.filter(p => !roles.some(r => r.permissions.some(rp => rp.id === p.id))).length;

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Sticky page header ──────────────────────────────────────────────── */}
      <header className="page-header">
        <div>
          <p className="cmd-label mb-1" style={{ color: "var(--text-3)" }}>
            Access · Control
          </p>
          <h1 className="page-title">
            <span className="page-title-prefix">#</span>
            RBAC
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: "var(--text-3)", fontFamily: "'JetBrains Mono', monospace" }}>
            Roles &amp; Permissions
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowAssign(v => !v); }}
            className={showAssign ? "btn-ghost btn-sm" : "btn-primary btn-sm"}
          >
            {showAssign ? <X className="w-3.5 h-3.5" /> : <UserCog className="w-3.5 h-3.5" />}
            {showAssign ? "Annuler" : "Assigner un rôle"}
          </button>
          <button
            onClick={() => { setShowRole(v => !v); setErrRole(null); }}
            className="btn-ghost btn-sm"
          >
            {showRole ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showRole ? "Annuler" : "Nouveau rôle"}
          </button>
          <button
            onClick={() => { setShowPerm(v => !v); setErrPerm(null); }}
            className="btn-ghost btn-sm"
          >
            {showPerm ? <X className="w-3.5 h-3.5" /> : <KeyRound className="w-3.5 h-3.5" />}
            {showPerm ? "Annuler" : "Nouvelle permission"}
          </button>
          <div
            className="w-px h-5 mx-1"
            style={{ background: "var(--border-2)" }}
          />
          <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {/* ── Page content ────────────────────────────────────────────────────── */}
      <div className="page-content flex-1 animate-enter">

        {/* Load error */}
        {loadErr && (
          <div className="alert-danger mb-5 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {loadErr}
          </div>
        )}

        {/* ── Assign role panel ──────────────────────────────────────────── */}
        {showAssign && (
          <AssignRolePanel roles={roles} tenants={tenants} />
        )}

        {/* ── Create role form (collapsible) ─────────────────────────────── */}
        {showRole && (
          <div
            className="panel p-4 mb-5 space-y-3 animate-slide-up"
            style={{ borderColor: "var(--signal-ok-border)", borderStyle: "dashed" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-3.5 h-3.5" style={{ color: "var(--xcore)" }} />
              <span className="cmd-label">Nouveau rôle</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] mb-1.5 cmd-label">
                  Nom <span style={{ color: "var(--signal-danger)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={roleName}
                  onChange={e => setRoleName(e.target.value)}
                  className="input text-xs mono-value"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  placeholder="ex: developer"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === "Enter") handleCreateRole();
                    if (e.key === "Escape") setShowRole(false);
                  }}
                />
              </div>
              <div>
                <label className="block text-[10px] mb-1.5 cmd-label">
                  Tenant <span style={{ color: "var(--text-3)" }}>(opt.)</span>
                </label>
                <input
                  type="text"
                  value={roleTenant}
                  onChange={e => setRoleTenant(e.target.value)}
                  className="input text-xs mono-value"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  placeholder="UUID tenant"
                />
              </div>
            </div>
            <input
              type="text"
              value={roleDesc}
              onChange={e => setRoleDesc(e.target.value)}
              className="input text-xs"
              placeholder="Description courte…"
            />
            {errRole && (
              <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--signal-danger)" }}>
                <AlertTriangle className="w-3 h-3" />{errRole}
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={handleCreateRole} disabled={busyRole || !roleName.trim()} className="btn-primary btn-sm">
                {busyRole ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Créer le rôle
              </button>
              <button onClick={() => { setShowRole(false); setErrRole(null); setRoleName(""); setRoleDesc(""); setRoleTenant(""); }} className="btn-ghost btn-sm">
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* ── Create permission form (collapsible) ───────────────────────── */}
        {showPerm && (
          <div
            className="panel p-4 mb-5 space-y-3 animate-slide-up"
            style={{ borderColor: "var(--signal-ok-border)", borderStyle: "dashed" }}
          >
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="w-3.5 h-3.5" style={{ color: "var(--xcore)" }} />
              <span className="cmd-label">Nouvelle permission</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] mb-1.5 cmd-label">
                  Nom <span style={{ color: "var(--signal-danger)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={permName}
                  onChange={e => setPermName(e.target.value)}
                  className="input text-xs mono-value"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  placeholder="ex: plugin:approve"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === "Enter") handleCreatePermission();
                    if (e.key === "Escape") setShowPerm(false);
                  }}
                />
              </div>
              <div>
                <label className="block text-[10px] mb-1.5 cmd-label">Description</label>
                <input
                  type="text"
                  value={permDesc}
                  onChange={e => setPermDesc(e.target.value)}
                  className="input text-xs"
                  placeholder="Description…"
                />
              </div>
            </div>
            {errPerm && (
              <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--signal-danger)" }}>
                <AlertTriangle className="w-3 h-3" />{errPerm}
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={handleCreatePermission} disabled={busyPerm || !permName.trim()} className="btn-primary btn-sm">
                {busyPerm ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Créer la permission
              </button>
              <button onClick={() => { setShowPerm(false); setErrPerm(null); setPermName(""); setPermDesc(""); }} className="btn-ghost btn-sm">
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* ── Two-column grid ─────────────────────────────────────────────── */}
        <div className="grid gap-6" style={{ gridTemplateColumns: "3fr 2fr" }}>

          {/* ── LEFT — Roles panel ──────────────────────────────────────── */}
          <div className="panel overflow-hidden">
            {/* Panel header */}
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}
            >
              <Shield className="w-3.5 h-3.5" style={{ color: "var(--xcore)" }} />
              <span className="cmd-label">Roles</span>
              {!loading && (
                <span
                  className="mono-value text-[11px] px-2 py-0.5 rounded ml-1"
                  style={{ background: "var(--surface-3)", color: "var(--text-2)" }}
                >
                  {roles.length}
                </span>
              )}
            </div>

            {/* Role list */}
            {loading ? (
              <div className="space-y-0">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <div className="skeleton w-6 h-6 rounded-md" />
                    <div className="space-y-1.5 flex-1">
                      <div className="skeleton h-3 rounded w-28" />
                      <div className="skeleton h-2.5 rounded w-16" />
                    </div>
                    <div className="skeleton h-4 rounded w-8" />
                  </div>
                ))}
              </div>
            ) : roles.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <Shield className="w-8 h-8 mx-auto opacity-15" style={{ color: "var(--text-3)" }} />
                <p className="text-sm" style={{ color: "var(--text-3)" }}>Aucun rôle défini</p>
                <button
                  onClick={() => setShowRole(true)}
                  className="btn-ghost btn-sm mx-auto"
                  style={{ display: "inline-flex" }}
                >
                  <Plus className="w-3.5 h-3.5" /> Créer le premier rôle
                </button>
              </div>
            ) : (
              <div>
                {roles.map((role, idx) => (
                  <RoleCard
                    key={role.id}
                    role={role}
                    allPerms={permissions}
                    isLast={idx === roles.length - 1}
                    onUpdated={updated =>
                      setRoles(prev => prev.map(r => r.id === updated.id ? updated : r))
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── RIGHT — Permissions registry panel ──────────────────────── */}
          <div className="panel overflow-hidden">
            {/* Panel header */}
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}
            >
              <Lock className="w-3.5 h-3.5" style={{ color: "var(--xcore)" }} />
              <span className="cmd-label">Permissions</span>
              {!loading && (
                <span
                  className="mono-value text-[11px] px-2 py-0.5 rounded ml-1"
                  style={{ background: "var(--surface-3)", color: "var(--text-2)" }}
                >
                  {permissions.length}
                </span>
              )}
              {!loading && wildcardCount > 0 && (
                <span
                  className="badge badge-red ml-auto"
                  style={{ fontSize: "9px", padding: "1px 6px" }}
                >
                  <Zap className="w-2 h-2" /> {wildcardCount}
                </span>
              )}
            </div>

            {/* Unassigned warning */}
            {!loading && permissions.length > 0 && unassigned > 0 && (
              <div
                className="flex items-center gap-2 px-4 py-2 text-[11px]"
                style={{
                  background: "var(--signal-warn-dim)",
                  borderBottom: "1px solid var(--signal-warn-border)",
                  color: "#D4A050",
                }}
              >
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                {unassigned} permission{unassigned > 1 ? "s" : ""} non assignée{unassigned > 1 ? "s" : ""}
              </div>
            )}

            {/* Registry list */}
            <PermissionRegistry
              permissions={permissions}
              roles={roles}
              loading={loading}
            />
          </div>

        </div>

        {/* ── Stats bar ───────────────────────────────────────────────────── */}
        {!loading && (
          <div
            className="panel mt-6 overflow-hidden animate-fade-in"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <div className="flex items-stretch">
              <StatTile
                label="Total Roles"
                value={roles.length}
                accent="green"
                icon={Shield}
              />
              <StatTile
                label="Total Permissions"
                value={permissions.length}
                accent="blue"
                icon={KeyRound}
              />
              <StatTile
                label="Wildcard"
                value={wildcardCount}
                accent={wildcardCount > 0 ? "red" : "neutral"}
                icon={Zap}
              />
              <div
                className="flex items-center gap-3 px-5 py-3 flex-1"
              >
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 opacity-60" style={{ color: unassigned > 0 ? "var(--signal-warn)" : "var(--text-3)" }} />
                <div>
                  <div
                    className="mono-value font-semibold"
                    style={{
                      color: unassigned > 0 ? "var(--signal-warn)" : "var(--text-3)",
                      fontSize: "15px",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {unassigned}
                  </div>
                  <div className="cmd-label mt-0.5" style={{ fontSize: "9px" }}>Non assignées</div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
