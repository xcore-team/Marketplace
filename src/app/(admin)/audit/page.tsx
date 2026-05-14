"use client";

import { useEffect, useState, useCallback } from "react";
import { auditApi, type AuditLogOut } from "@/lib/admin-api";
import {
  RefreshCw, ChevronLeft, ChevronRight, Search,
  ChevronDown, ChevronRight as ChevronRt,
} from "lucide-react";

const PAGE_SIZE = 50;

const ACTION_OPTS = [
  "user_banned", "user_unbanned", "user_deleted",
  "plugin_published", "plugin_unpublished", "plugin_deleted", "plugin_version_yanked",
  "submission_status_changed",
  "category_created", "category_updated", "category_deleted",
  "login", "logout",
] as const;

const ACTION_COLOR: Record<string, string> = {
  user_banned:               "var(--signal-danger)",
  user_unbanned:             "var(--signal-ok)",
  user_deleted:              "var(--signal-danger)",
  plugin_published:          "var(--signal-ok)",
  plugin_unpublished:        "var(--signal-warn)",
  plugin_deleted:            "var(--signal-danger)",
  plugin_version_yanked:     "var(--signal-warn)",
  submission_status_changed: "var(--signal-pending)",
  category_created:          "var(--xcore)",
  category_updated:          "var(--xcore-mint)",
  category_deleted:          "var(--signal-danger)",
  login:                     "var(--text-2)",
  logout:                    "var(--text-3)",
};

function AuditRow({ log }: { log: AuditLogOut }) {
  const [expanded, setExpanded] = useState(false);

  const ts = new Date(log.created_at);
  const time = ts.toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const actionColor = ACTION_COLOR[log.action] ?? "var(--text-2)";
  const hasDetails  = log.details && Object.keys(log.details).length > 0;

  return (
    <>
      <tr
        style={{ borderBottom: expanded ? "none" : "1px solid var(--border)" }}
        className="group"
      >
        {/* Timestamp */}
        <td className="px-4 py-3 mono-value text-xs whitespace-nowrap" style={{ color: "var(--text-3)" }}>
          {time}
        </td>

        {/* User ID */}
        <td className="px-4 py-3 mono-value text-xs" style={{ color: "var(--text-3)" }}>
          {log.user_id ? `${log.user_id.slice(0, 8)}…` : "—"}
        </td>

        {/* Action */}
        <td className="px-4 py-3">
          <span className="text-xs font-semibold mono-value" style={{ color: actionColor }}>
            {log.action}
          </span>
        </td>

        {/* Resource */}
        <td className="px-4 py-3 text-xs" style={{ color: "var(--text-2)" }}>
          {log.resource ?? "—"}
        </td>

        {/* IP */}
        <td className="px-4 py-3 mono-value text-xs" style={{ color: "var(--text-3)" }}>
          {log.ip_address ?? "—"}
        </td>

        {/* Details toggle */}
        <td className="px-4 py-3">
          {hasDetails ? (
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1 text-[10px] mono-value transition-colors"
              style={{ color: expanded ? "var(--xcore)" : "var(--text-3)" }}
            >
              {expanded
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRt className="w-3 h-3" />}
              {expanded ? "Replier" : "Voir"}
            </button>
          ) : (
            <span className="text-xs" style={{ color: "var(--text-3)" }}>—</span>
          )}
        </td>
      </tr>

      {/* Expanded details */}
      {expanded && hasDetails && (
        <tr style={{ borderBottom: "1px solid var(--border)" }}>
          <td colSpan={6} style={{ padding: 0 }}>
            <div
              className="px-4 py-3"
              style={{
                background: "var(--surface-2)",
                borderLeft: "2px solid var(--xcore-glow)",
                marginLeft: 16,
              }}
            >
              <pre
                className="text-[11px] mono-value overflow-x-auto"
                style={{ color: "var(--text-2)", margin: 0 }}
              >
                {JSON.stringify(log.details, null, 2)}
              </pre>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AuditPage() {
  const [logs,    setLogs]    = useState<AuditLogOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset,  setOffset]  = useState(0);
  const [userId,  setUserId]  = useState("");
  const [action,  setAction]  = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { user_id?: string; action?: string; limit: number; offset: number } = {
        limit: PAGE_SIZE,
        offset,
      };
      if (userId) params.user_id = userId;
      if (action) params.action  = action;
      setLogs(await auditApi.list(params));
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [offset, userId, action]);

  useEffect(() => { load(); }, [load]);

  const page    = Math.floor(offset / PAGE_SIZE) + 1;
  const hasMore = logs.length === PAGE_SIZE;

  return (
    <div className="p-6 space-y-5 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--text-1)" }}>
            Audit Log
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-3)" }}>
            Historique complet des actions admin et utilisateurs
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
            placeholder="Filtrer par user ID…"
            value={userId}
            onChange={e => { setUserId(e.target.value); setOffset(0); }}
            className="input pl-8 py-2 text-xs mono-value"
          />
        </div>

        <select
          value={action}
          onChange={e => { setAction(e.target.value); setOffset(0); }}
          className="input py-1.5 text-xs mono-value"
          style={{ width: "auto", minWidth: 210 }}
        >
          <option value="">Toutes les actions</option>
          {ACTION_OPTS.map(a => (
            <option key={a} value={a} style={{ color: ACTION_COLOR[a] ?? "inherit" }}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Timestamp", "User ID", "Action", "Resource", "IP", "Détails"].map(h => (
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
                    {[100, 80, 160, 90, 90, 50].map((w, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="skeleton h-4 rounded" style={{ width: w }} />
                      </td>
                    ))}
                  </tr>
                ))
              : logs.map(log => <AuditRow key={log.id} log={log} />)
            }
          </tbody>
        </table>
        {!loading && logs.length === 0 && (
          <div className="py-16 text-center text-sm" style={{ color: "var(--text-3)" }}>
            Aucun log d'audit trouvé.
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--text-3)" }}>
          Page {page}
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
            disabled={!hasMore}
            className="btn-outline btn-sm"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

    </div>
  );
}
