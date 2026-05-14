"use client";

import { useEffect, useState, useCallback } from "react";
import {
  rbacApi,
  type RoleResponse, type PermissionResponse,
  type RoleCreate, type PermissionCreate,
  AdminApiError,
} from "@/lib/admin-api";
import {
  RefreshCw, Plus, X, Check, ChevronDown, ChevronRight,
  Lock, Shield, ShieldCheck, Loader2, AlertTriangle, Trash2,
} from "lucide-react";

// ── Composant : badge permission ─────────────────────────────────────────────

function PermBadge({
  perm,
  onRemove,
  removing,
}: {
  perm: PermissionResponse;
  onRemove?: () => void;
  removing?: boolean;
}) {
  const isWildcard = perm.name.includes("*");
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold"
      style={{
        background: isWildcard ? "rgba(239,68,68,0.1)"   : "var(--xcore-dim)",
        color:      isWildcard ? "var(--signal-danger)"  : "var(--xcore)",
        border:     `1px solid ${isWildcard ? "rgba(239,68,68,0.2)" : "var(--xcore-glow)"}`,
      }}
    >
      {perm.name}
      {onRemove && (
        <button
          onClick={onRemove}
          disabled={removing}
          className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
          aria-label={`Retirer ${perm.name}`}
        >
          {removing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <X className="w-2.5 h-2.5" />}
        </button>
      )}
    </span>
  );
}

// ── Composant : carte rôle (expandable) ──────────────────────────────────────

function RoleCard({
  role,
  allPerms,
  onUpdated,
}: {
  role: RoleResponse;
  allPerms: PermissionResponse[];
  onUpdated: (r: RoleResponse) => void;
}) {
  const [expanded,   setExpanded]   = useState(false);
  const [addingPerm, setAddingPerm] = useState(false);
  const [selectedPerm, setSelectedPerm] = useState("");
  const [busy,       setBusy]       = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [err,        setErr]        = useState<string | null>(null);

  const assignedIds = new Set(role.permissions.map(p => p.id));
  const available   = allPerms.filter(p => !assignedIds.has(p.id));

  async function handleAddPerm() {
    if (!selectedPerm) return;
    setBusy(true);
    setErr(null);
    try {
      const updated = await rbacApi.assignPermission(role.id, selectedPerm);
      onUpdated(updated);
      setSelectedPerm("");
      setAddingPerm(false);
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemovePerm(permId: string) {
    setRemovingId(permId);
    setErr(null);
    try {
      const updated = await rbacApi.removePermission(role.id, permId);
      onUpdated(updated);
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally {
      setRemovingId(null);
    }
  }

  const isAdmin = role.name.includes("admin") || role.name.includes("super");

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        border: `1px solid ${expanded ? "var(--xcore-glow)" : "var(--border)"}`,
        background: expanded ? "var(--surface-2)" : "transparent",
        transition: "border-color 0.15s",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
          style={{
            background: isAdmin ? "var(--xcore-dim)" : "rgba(148,163,184,0.08)",
          }}
        >
          {isAdmin
            ? <ShieldCheck className="w-3.5 h-3.5" style={{ color: "var(--xcore)" }} />
            : <Shield className="w-3.5 h-3.5" style={{ color: "var(--text-3)" }} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold font-mono" style={{ color: "var(--text-1)" }}>
              {role.name}
            </span>
            {role.tenant_id && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded mono-value"
                style={{ background: "rgba(148,163,184,0.08)", color: "var(--text-3)" }}
              >
                tenant: {role.tenant_id.slice(0, 8)}…
              </span>
            )}
          </div>
          {role.description && (
            <div className="text-xs mt-0.5 truncate" style={{ color: "var(--text-3)" }}>
              {role.description}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="text-[10px] mono-value px-1.5 py-0.5 rounded"
            style={{ background: "var(--surface-2)", color: "var(--text-3)" }}
          >
            {role.permissions.length} perm{role.permissions.length !== 1 ? "s" : ""}
          </span>
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--xcore)" }} />
            : <ChevronRight className="w-3.5 h-3.5" style={{ color: "var(--text-3)" }} />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="pt-3">
            {err && (
              <div className="text-xs mb-2" style={{ color: "var(--signal-danger)" }}>{err}</div>
            )}

            {/* Current permissions */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {role.permissions.length > 0
                ? role.permissions.map(p => (
                  <PermBadge
                    key={p.id}
                    perm={p}
                    onRemove={() => handleRemovePerm(p.id)}
                    removing={removingId === p.id}
                  />
                ))
                : <span className="text-xs" style={{ color: "var(--text-3)" }}>
                    Aucune permission assignée.
                  </span>
              }
            </div>

            {/* Add permission */}
            {addingPerm ? (
              <div className="flex items-center gap-2">
                <select
                  value={selectedPerm}
                  onChange={e => setSelectedPerm(e.target.value)}
                  className="input py-1 text-xs flex-1 font-mono"
                  autoFocus
                >
                  <option value="">— Choisir une permission —</option>
                  {available.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleAddPerm}
                  disabled={busy || !selectedPerm}
                  className="btn-success btn-sm"
                  style={{ padding: "4px 10px" }}
                >
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => { setAddingPerm(false); setSelectedPerm(""); setErr(null); }}
                  className="btn-ghost btn-sm"
                  style={{ padding: "4px 8px" }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingPerm(true)}
                disabled={available.length === 0}
                className="btn-ghost btn-sm text-xs"
                style={{ padding: "3px 10px" }}
              >
                <Plus className="w-3 h-3" />
                {available.length === 0 ? "Toutes les permissions assignées" : "Ajouter une permission"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function RBACPage() {
  const [roles,       setRoles]       = useState<RoleResponse[]>([]);
  const [permissions, setPermissions] = useState<PermissionResponse[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadErr,     setLoadErr]     = useState<string | null>(null);

  // Create role form
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [roleName,       setRoleName]       = useState("");
  const [roleDesc,       setRoleDesc]       = useState("");
  const [roleTenant,     setRoleTenant]     = useState("");
  const [creatingRole,   setCreatingRole]   = useState(false);
  const [createRoleErr,  setCreateRoleErr]  = useState<string | null>(null);

  // Create permission form
  const [showCreatePerm, setShowCreatePerm] = useState(false);
  const [permName,       setPermName]       = useState("");
  const [permDesc,       setPermDesc]       = useState("");
  const [creatingPerm,   setCreatingPerm]   = useState(false);
  const [createPermErr,  setCreatePermErr]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const [r, p] = await Promise.all([rbacApi.listRoles(), rbacApi.listPermissions()]);
      setRoles(r);
      setPermissions(p);
    } catch (e) {
      setLoadErr(e instanceof AdminApiError ? e.message : "Impossible de charger les données RBAC");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreateRole() {
    if (!roleName.trim()) { setCreateRoleErr("Nom requis"); return; }
    setCreatingRole(true);
    setCreateRoleErr(null);
    try {
      const body: RoleCreate = { name: roleName.trim() };
      if (roleDesc.trim())   body.description = roleDesc.trim();
      if (roleTenant.trim()) body.tenant_id   = roleTenant.trim();
      const created = await rbacApi.createRole(body);
      setRoles(prev => [...prev, created]);
      setRoleName(""); setRoleDesc(""); setRoleTenant("");
      setShowCreateRole(false);
    } catch (e) {
      setCreateRoleErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally {
      setCreatingRole(false);
    }
  }

  async function handleCreatePermission() {
    if (!permName.trim()) { setCreatePermErr("Nom requis"); return; }
    setCreatingPerm(true);
    setCreatePermErr(null);
    try {
      const body: PermissionCreate = { name: permName.trim() };
      if (permDesc.trim()) body.description = permDesc.trim();
      const created = await rbacApi.createPermission(body);
      setPermissions(prev => [...prev, created]);
      setPermName(""); setPermDesc("");
      setShowCreatePerm(false);
    } catch (e) {
      setCreatePermErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally {
      setCreatingPerm(false);
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--text-1)" }}>
            RBAC
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-3)" }}>
            Gestion des rôles et permissions
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loadErr && (
        <div className="alert-danger flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {loadErr}
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-5" style={{ gridTemplateColumns: "1fr 340px" }}>

        {/* ── Rôles ─────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text-1)" }}>
              <Shield className="w-4 h-4" style={{ color: "var(--xcore)" }} />
              Rôles
              {!loading && (
                <span className="mono-value text-xs" style={{ color: "var(--text-3)" }}>
                  {roles.length}
                </span>
              )}
            </h2>
            <button
              onClick={() => setShowCreateRole(v => !v)}
              className="btn-primary btn-sm"
              style={{ padding: "4px 12px" }}
            >
              <Plus className="w-3.5 h-3.5" />
              Nouveau rôle
            </button>
          </div>

          {/* Create role form */}
          {showCreateRole && (
            <div
              className="panel p-4 space-y-3"
              style={{ borderColor: "var(--xcore-glow)" }}
            >
              <h3 className="text-xs font-semibold" style={{ color: "var(--text-2)" }}>
                Créer un rôle
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] mb-1" style={{ color: "var(--text-3)" }}>
                    Nom <span style={{ color: "var(--signal-danger)" }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={roleName}
                    onChange={e => setRoleName(e.target.value)}
                    className="input text-xs font-mono"
                    placeholder="ex: developer"
                    autoFocus
                    onKeyDown={e => e.key === "Enter" && handleCreateRole()}
                  />
                </div>
                <div>
                  <label className="block text-[11px] mb-1" style={{ color: "var(--text-3)" }}>
                    Tenant ID <span style={{ color: "var(--text-3)" }}>(optionnel)</span>
                  </label>
                  <input
                    type="text"
                    value={roleTenant}
                    onChange={e => setRoleTenant(e.target.value)}
                    className="input text-xs mono-value"
                    placeholder="UUID du tenant"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] mb-1" style={{ color: "var(--text-3)" }}>
                  Description
                </label>
                <input
                  type="text"
                  value={roleDesc}
                  onChange={e => setRoleDesc(e.target.value)}
                  className="input text-xs"
                  placeholder="Courte description du rôle…"
                />
              </div>
              {createRoleErr && (
                <p className="text-xs" style={{ color: "var(--signal-danger)" }}>{createRoleErr}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleCreateRole}
                  disabled={creatingRole || !roleName.trim()}
                  className="btn-primary btn-sm"
                  style={{ padding: "5px 14px" }}
                >
                  {creatingRole ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Créer
                </button>
                <button
                  onClick={() => { setShowCreateRole(false); setCreateRoleErr(null); setRoleName(""); }}
                  className="btn-ghost btn-sm"
                  style={{ padding: "5px 12px" }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Role cards */}
          {loading
            ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="panel p-4">
                    <div className="flex items-center gap-3">
                      <div className="skeleton w-7 h-7 rounded-md" />
                      <div className="space-y-1.5 flex-1">
                        <div className="skeleton h-4 rounded" style={{ width: 120 }} />
                        <div className="skeleton h-3 rounded" style={{ width: 80 }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
            : roles.length === 0
              ? (
                <div className="panel py-12 text-center space-y-2">
                  <Shield className="w-7 h-7 mx-auto" style={{ color: "var(--text-3)" }} />
                  <p className="text-sm" style={{ color: "var(--text-3)" }}>Aucun rôle défini.</p>
                </div>
              )
              : (
                <div className="space-y-2">
                  {roles.map(role => (
                    <RoleCard
                      key={role.id}
                      role={role}
                      allPerms={permissions}
                      onUpdated={updated => setRoles(prev => prev.map(r => r.id === updated.id ? updated : r))}
                    />
                  ))}
                </div>
              )
          }
        </div>

        {/* ── Permissions ───────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text-1)" }}>
              <Lock className="w-4 h-4" style={{ color: "var(--xcore)" }} />
              Permissions
              {!loading && (
                <span className="mono-value text-xs" style={{ color: "var(--text-3)" }}>
                  {permissions.length}
                </span>
              )}
            </h2>
            <button
              onClick={() => setShowCreatePerm(v => !v)}
              className="btn-ghost btn-sm"
              style={{ padding: "4px 10px" }}
            >
              <Plus className="w-3.5 h-3.5" />
              Nouvelle
            </button>
          </div>

          {/* Create permission form */}
          {showCreatePerm && (
            <div
              className="panel p-4 space-y-3"
              style={{ borderColor: "var(--xcore-glow)" }}
            >
              <div>
                <label className="block text-[11px] mb-1" style={{ color: "var(--text-3)" }}>
                  Nom <span style={{ color: "var(--signal-danger)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={permName}
                  onChange={e => setPermName(e.target.value)}
                  className="input text-xs font-mono"
                  placeholder="ex: plugin:approve"
                  autoFocus
                  onKeyDown={e => e.key === "Enter" && handleCreatePermission()}
                />
              </div>
              <div>
                <label className="block text-[11px] mb-1" style={{ color: "var(--text-3)" }}>
                  Description
                </label>
                <input
                  type="text"
                  value={permDesc}
                  onChange={e => setPermDesc(e.target.value)}
                  className="input text-xs"
                  placeholder="Description…"
                />
              </div>
              {createPermErr && (
                <p className="text-xs" style={{ color: "var(--signal-danger)" }}>{createPermErr}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleCreatePermission}
                  disabled={creatingPerm || !permName.trim()}
                  className="btn-primary btn-sm"
                  style={{ padding: "4px 12px" }}
                >
                  {creatingPerm ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Créer
                </button>
                <button
                  onClick={() => { setShowCreatePerm(false); setCreatePermErr(null); setPermName(""); }}
                  className="btn-ghost btn-sm"
                  style={{ padding: "4px 10px" }}
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Permissions list */}
          <div className="panel overflow-hidden">
            {loading
              ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="skeleton h-8 rounded" />
                  ))}
                </div>
              )
              : permissions.length === 0
                ? (
                  <div className="py-10 text-center">
                    <p className="text-sm" style={{ color: "var(--text-3)" }}>Aucune permission.</p>
                  </div>
                )
                : (
                  <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {permissions.map(perm => {
                      const usedBy  = roles.filter(r => r.permissions.some(p => p.id === perm.id));
                      const isWild  = perm.name.includes("*");
                      return (
                        <div
                          key={perm.id}
                          className="px-4 py-2.5 flex items-start justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div
                              className="text-xs font-mono font-semibold"
                              style={{ color: isWild ? "var(--signal-danger)" : "var(--xcore)" }}
                            >
                              {perm.name}
                            </div>
                            {perm.description && (
                              <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--text-3)" }}>
                                {perm.description}
                              </div>
                            )}
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <span className="mono-value text-[10px]" style={{ color: "var(--text-3)" }}>
                              {usedBy.length > 0
                                ? `${usedBy.length} rôle${usedBy.length > 1 ? "s" : ""}`
                                : "non assignée"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
            }
          </div>
        </div>

      </div>
    </div>
  );
}
