"use client";

import { useEffect, useState, useCallback } from "react";
import { auditApi, type AuditLogOut } from "@/lib/admin-api";
import { RefreshCw, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRt } from "lucide-react";

const PAGE_SIZE = 50;

const ACTION_OPTS = [
  "user_banned", "user_unbanned", "user_deleted",
  "plugin_published", "plugin_unpublished", "plugin_deleted", "plugin_version_yanked",
  "submission_status_changed",
  "category_created", "category_updated", "category_deleted",
  "login", "logout",
] as const;

// One semantic color per action — strictly from palette
function actionColor(action: string): string {
  if (["user_banned", "user_deleted", "plugin_deleted", "category_deleted"].includes(action))
    return "var(--signal-danger)";
  if (["user_unbanned", "plugin_published", "category_created"].includes(action))
    return "var(--signal-ok)";
  if (["plugin_unpublished", "plugin_version_yanked", "category_updated"].includes(action))
    return "var(--signal-warn)";
  if (action === "submission_status_changed")
    return "var(--signal-pending)";
  return "var(--text-3)"; // login, logout — neutral
}

// Group actions into filter categories
const FILTER_GROUPS = [
  { value: "",           label: "All" },
  { value: "user",       label: "Users" },
  { value: "plugin",     label: "Plugins" },
  { value: "submission", label: "Submissions" },
  { value: "category",   label: "Categories" },
  { value: "auth",       label: "Auth" },
] as const;

// ── Timeline entry ────────────────────────────────────────────────────────────

function AuditEntry({ log, isLast }: { log: AuditLogOut; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const color    = actionColor(log.action);
  const hasDetails = log.details && Object.keys(log.details).length > 0;

  const ts  = new Date(log.created_at);
  const time = ts.toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="relative" style={{ paddingLeft: 28 }}>
      {/* Vertical spine */}
      {!isLast && (
        <div
          className="absolute"
          style={{
            left: 7,
            top: 14,
            bottom: 0,
            width: 1,
            background: "var(--border)",
          }}
        />
      )}

      {/* Timeline dot */}
      <div
        className="absolute"
        style={{
          left: 3,
          top: 10,
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 6px ${color}55`,
          flexShrink: 0,
        }}
      />

      {/* Card */}
      <div
        className="mb-3 rounded-lg transition-colors"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        {/* Main row */}
        <div
          className="flex items-center gap-3 px-4 py-2.5"
          style={{ minHeight: 44 }}
        >
          {/* Action name */}
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 12,
              fontWeight: 600,
              color,
              flexShrink: 0,
              letterSpacing: "0.01em",
            }}
          >
            {log.action}
          </span>

          {/* Resource chip */}
          {log.resource && (
            <span
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10,
                color: "var(--text-2)",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "1px 7px",
                flexShrink: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 200,
              }}
            >
              {log.resource}
            </span>
          )}

          {/* User badge */}
          {log.user_id && (
            <span
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10,
                color: "var(--signal-pending)",
                background: "rgba(56,189,248,0.08)",
                border: "1px solid rgba(56,189,248,0.18)",
                borderRadius: 4,
                padding: "1px 7px",
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              {log.user_id.slice(0, 8)}&hellip;
            </span>
          )}

          {/* IP address */}
          {log.ip_address && (
            <span
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10,
                color: "var(--text-3)",
                flexShrink: 0,
              }}
            >
              {log.ip_address}
            </span>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Timestamp */}
          <span
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              color: "var(--text-3)",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {time}
          </span>

          {/* Expand toggle */}
          {hasDetails && (
            <button
              onClick={() => setExpanded(v => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 20,
                height: 20,
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: expanded ? "var(--xcore-dim)" : "transparent",
                color: expanded ? "var(--xcore)" : "var(--text-3)",
                cursor: "pointer",
                flexShrink: 0,
                transition: "background 0.15s, color 0.15s",
                padding: 0,
              }}
            >
              {expanded
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRt  className="w-3 h-3" />}
            </button>
          )}
        </div>

        {/* JSON details panel */}
        {expanded && hasDetails && (
          <div
            style={{
              borderTop: `1px solid ${color}33`,
              background: "#020409",
              padding: "10px 16px",
              borderLeft: `2px solid ${color}`,
            }}
          >
            <pre
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 11,
                color: "var(--text-2)",
                margin: 0,
                overflowX: "auto",
                lineHeight: 1.6,
              }}
            >
              {JSON.stringify(log.details, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Skeleton timeline entry ───────────────────────────────────────────────────

function SkeletonEntry({ isLast }: { isLast: boolean }) {
  return (
    <div className="relative" style={{ paddingLeft: 28 }}>
      {!isLast && (
        <div
          className="absolute"
          style={{ left: 7, top: 14, bottom: 0, width: 1, background: "var(--border)" }}
        />
      )}
      <div
        className="absolute skeleton"
        style={{ left: 3, top: 10, width: 9, height: 9, borderRadius: "50%" }}
      />
      <div
        className="mb-3 rounded-lg flex items-center gap-3 px-4"
        style={{
          height: 44,
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="skeleton rounded" style={{ width: 140, height: 12 }} />
        <div className="skeleton rounded" style={{ width: 80, height: 12 }} />
        <div className="skeleton rounded" style={{ width: 60, height: 12 }} />
        <div style={{ flex: 1 }} />
        <div className="skeleton rounded" style={{ width: 72, height: 10 }} />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [logs,    setLogs]    = useState<AuditLogOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset,  setOffset]  = useState(0);
  const [userId,  setUserId]  = useState("");
  const [action,  setAction]  = useState("");
  const [group,   setGroup]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { user_id?: string; action?: string; limit: number; offset: number } = {
        limit: PAGE_SIZE, offset,
      };
      if (userId) params.user_id = userId;
      if (action) params.action  = action;
      setLogs(await auditApi.list(params));
    } catch {
      setLogs([]);
    } finally { setLoading(false); }
  }, [offset, userId, action]);

  useEffect(() => { load(); }, [load]);

  const page    = Math.floor(offset / PAGE_SIZE) + 1;
  const hasMore = logs.length === PAGE_SIZE;

  // Filter logs client-side by group (when no specific action selected)
  const displayedLogs = (group && !action)
    ? logs.filter(l => {
        if (group === "auth")       return ["login", "logout"].includes(l.action);
        return l.action.startsWith(group);
      })
    : logs;

  return (
    <div>
      {/* ── Sticky page header ── */}
      <div className="page-header" style={{ gap: 16 }}>
        <div className="flex items-center gap-3 flex-shrink-0">
          <h1 className="page-title">
            <span className="page-title-prefix">/</span>
            Audit Log
          </h1>
          <span className="badge-gray mono-value" style={{ fontSize: 10 }}>
            {displayedLogs.length} events
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap flex-1 justify-end">
          <div className="filter-bar">
            {FILTER_GROUPS.map(g => (
              <button
                key={g.value}
                onClick={() => { setGroup(g.value); setAction(""); setOffset(0); }}
                className={`filter-chip${group === g.value ? " active" : ""}`}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div style={{ width: 1, height: 18, background: "var(--border)", flexShrink: 0 }} />

          <select
            value={action}
            onChange={e => { setAction(e.target.value); setGroup(""); setOffset(0); }}
            className="input mono-value"
            style={{ fontSize: 11, minWidth: 150, height: 28, padding: "0 10px", color: action ? actionColor(action) : undefined }}
          >
            <option value="">Action…</option>
            {ACTION_OPTS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <div className="relative">
            <Search className="absolute" style={{ left: 9, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: "var(--text-3)", pointerEvents: "none" }} />
            <input
              type="text"
              placeholder="User ID…"
              value={userId}
              onChange={e => { setUserId(e.target.value); setOffset(0); }}
              className="input mono-value"
              style={{ fontSize: 11, paddingLeft: 28, height: 28, width: 150 }}
            />
          </div>

          <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
            <RefreshCw style={{ width: 13, height: 13 }} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ── Page content ── */}
      <div className="page-content" style={{ maxWidth: 900 }}>
        {/* Timeline */}
        <div style={{ paddingTop: 8 }}>
          {loading ? (
            <>
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonEntry key={i} isLast={i === 7} />
              ))}
            </>
          ) : displayedLogs.length > 0 ? (
            displayedLogs.map((log, i) => (
              <AuditEntry
                key={log.id}
                log={log}
                isLast={i === displayedLogs.length - 1}
              />
            ))
          ) : (
            <div
              style={{
                paddingTop: 80,
                paddingBottom: 80,
                textAlign: "center",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 13,
                color: "var(--text-3)",
                letterSpacing: "0.04em",
              }}
            >
              — no events —
            </div>
          )}
        </div>

        {/* Pagination */}
        {!loading && displayedLogs.length > 0 && (
          <div
            className="flex items-center justify-between"
            style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}
          >
            <span
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 11,
                color: "var(--text-3)",
              }}
            >
              page {page}
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
        )}
      </div>
    </div>
  );
}
