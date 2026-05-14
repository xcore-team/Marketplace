"use client";

import { useEffect, useState, useCallback } from "react";
import { usersApi, type UserAdminOut, AdminApiError } from "@/lib/admin-api";
import {
  Search, ChevronLeft, ChevronRight, RefreshCw,
  UserX, UserCheck, Trash2, ShieldCheck, Shield, ExternalLink,
} from "lucide-react";
import Link from "next/link";

const PAGE_SIZE = 50;

function RoleBadge({ role }: { role: string }) {
  const isAdmin = role.includes("admin") || role.includes("super");
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase"
      style={{
        background: isAdmin ? "var(--xcore-dim)"         : "rgba(148,163,184,0.08)",
        color:      isAdmin ? "var(--xcore)"             : "var(--text-3)",
        border:     `1px solid ${isAdmin ? "var(--xcore-glow)" : "rgba(148,163,184,0.15)"}`,
      }}
    >
      {isAdmin ? <ShieldCheck className="w-2.5 h-2.5" /> : <Shield className="w-2.5 h-2.5" />}
      {role}
    </span>
  );
}

function UserRow({
  user,
  onUpdated,
  onDeleted,
}: {
  user: UserAdminOut;
  onUpdated: (u: UserAdminOut) => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState<string | null>(null);
  const active = user.is_active;

  async function toggleBan() {
    setBusy(true);
    setErr(null);
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
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Supprimer définitivement ${user.email} ?`)) return;
    setBusy(true);
    setErr(null);
    try {
      await usersApi.delete(user.id);
      onDeleted(user.id);
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur");
      setBusy(false);
    }
  }

  const joined = new Date(user.created_at).toLocaleDateString("fr-FR");

  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      {/* Status */}
      <td className="px-4 py-3">
        <span
          className="w-2 h-2 rounded-full inline-block"
          style={{ background: active ? "var(--signal-ok)" : "var(--signal-danger)" }}
        />
      </td>

      {/* Email */}
      <td className="px-4 py-3">
        <Link href={`/users/${user.id}`} className="group flex items-center gap-1.5">
          <div className="text-xs font-medium truncate max-w-[200px] group-hover:underline" style={{ color: "var(--text-1)" }}>
            {user.email}
          </div>
          <ExternalLink className="w-2.5 h-2.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--xcore)" }} />
        </Link>
        <div className="text-[10px] mono-value mt-0.5" style={{ color: "var(--text-3)" }}>
          {user.id.slice(0, 8)}…
        </div>
      </td>

      {/* Roles */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {user.roles.length > 0
            ? user.roles.map(r => <RoleBadge key={r} role={r} />)
            : <span className="text-xs" style={{ color: "var(--text-3)" }}>—</span>}
        </div>
      </td>

      {/* Plugins / Submissions */}
      <td className="px-4 py-3 mono-value text-xs" style={{ color: "var(--text-2)" }}>
        {user.plugin_count}
      </td>
      <td className="px-4 py-3 mono-value text-xs" style={{ color: "var(--text-2)" }}>
        {user.submission_count}
      </td>

      {/* MFA */}
      <td className="px-4 py-3 text-xs" style={{ color: user.mfa_enabled ? "var(--signal-ok)" : "var(--text-3)" }}>
        {user.mfa_enabled ? "Oui" : "Non"}
      </td>

      {/* Joined */}
      <td className="px-4 py-3 text-xs mono-value" style={{ color: "var(--text-3)" }}>
        {joined}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {err && <span className="text-[10px]" style={{ color: "var(--signal-danger)" }}>{err}</span>}
          <button
            onClick={toggleBan}
            disabled={busy}
            title={active ? "Bannir" : "Débannir"}
            className={active ? "btn-danger btn-sm" : "btn-success btn-sm"}
            style={{ padding: "3px 8px" }}
          >
            {active ? <UserX className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
            {active ? "Bannir" : "Débannir"}
          </button>
          <button
            onClick={handleDelete}
            disabled={busy}
            title="Supprimer définitivement"
            className="btn-ghost btn-sm"
            style={{ padding: "3px 8px", color: "var(--signal-danger)" }}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function UsersPage() {
  const [users, setUsers]   = useState<UserAdminOut[]>([]);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [isActive, setIsActive] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { search?: string; is_active?: boolean; limit: number; offset: number } = {
        limit: PAGE_SIZE,
        offset,
      };
      if (search)   params.search    = search;
      if (isActive) params.is_active = isActive === "true";
      const res = await usersApi.list(params);
      setUsers(res.items);
      setTotal(res.total);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [offset, search, isActive]);

  useEffect(() => { load(); }, [load]);

  const page      = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--text-1)" }}>
            Utilisateurs
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-3)" }}>
            {total.toLocaleString("fr-FR")} inscrits
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="panel p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--text-3)" }} />
          <input
            type="text"
            placeholder="Rechercher par email…"
            value={search}
            onChange={e => { setSearch(e.target.value); setOffset(0); }}
            className="input pl-8 py-2 text-xs"
          />
        </div>
        <select
          value={isActive}
          onChange={e => { setIsActive(e.target.value); setOffset(0); }}
          className="input py-1.5 text-xs"
          style={{ width: "auto", minWidth: 120 }}
        >
          <option value="">Tous les statuts</option>
          <option value="true">Actifs</option>
          <option value="false">Bannis</option>
        </select>
      </div>

      {/* Table */}
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["", "Email", "Rôles", "Plugins", "Soumissions", "MFA", "Inscription", "Actions"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "var(--text-3)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="skeleton h-4 rounded" style={{ width: j === 0 ? 16 : 80 }} />
                      </td>
                    ))}
                  </tr>
                ))
              : users.map(u => (
                  <UserRow
                    key={u.id}
                    user={u}
                    onUpdated={updated => setUsers(prev => prev.map(x => x.id === updated.id ? updated : x))}
                    onDeleted={id => setUsers(prev => prev.filter(x => x.id !== id))}
                  />
                ))}
          </tbody>
        </table>
        {!loading && users.length === 0 && (
          <div className="py-16 text-center text-sm" style={{ color: "var(--text-3)" }}>
            Aucun utilisateur trouvé.
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--text-3)" }}>
            Page {page} / {totalPages}
          </span>
          <div className="flex gap-2">
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
  );
}
