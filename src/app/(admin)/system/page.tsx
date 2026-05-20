"use client";

import { useEffect, useState, useCallback } from "react";
import { systemApi, type SystemInfo } from "@/lib/admin-api";
import { RefreshCw, AlertTriangle, Copy, Check } from "lucide-react";

function CopyButton({ value }: { value: string | undefined }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className="ml-2 flex-shrink-0 transition-colors"
      style={{ color: copied ? "var(--xcore)" : "var(--text-3)" }}
      title="Copy"
    >
      {copied
        ? <Check className="w-3 h-3" />
        : <Copy className="w-3 h-3" />}
    </button>
  );
}

export default function SystemPage() {
  const [info,    setInfo]    = useState<SystemInfo | null>(null);
  const [db,      setDb]      = useState<Record<string, number | null> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const [infoRes, dbRes] = await Promise.all([systemApi.info(), systemApi.db()]);
      setInfo(infoRes);
      setDb(dbRes);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dbMax = db ? Math.max(...Object.values(db).map(v => v ?? 0), 1) : 1;
  const dbTotal: number = db ? Object.values(db).reduce<number>((a, v) => a + (v ?? 0), 0) : 0;

  const runtimeRows: Array<{ key: string; value: string | undefined; highlight?: boolean; url?: boolean }> = info
    ? [
        { key: "APP_NAME",  value: info.env.APP_NAME,             highlight: true },
        { key: "Python",    value: info.python },
        { key: "Platform",  value: info.platform },
        { key: "PID",       value: String(info.pid) },
        { key: "Memory",    value: info.env.SANDBOX_MEMORY_MB     ? `${info.env.SANDBOX_MEMORY_MB} MB`  : "—" },
        { key: "CPU",       value: info.env.SANDBOX_CPU_SECONDS   ? `${info.env.SANDBOX_CPU_SECONDS} s` : "—" },
        { key: "Env",       value: "production" },
      ]
    : [];

  const urlRows: Array<{ key: string; value: string | undefined }> = info
    ? [
        { key: "DB URL",     value: info.env.DATABASE_URL },
        { key: "Broker URL", value: info.env.CELERY_BROKER_URL },
      ]
    : [];

  const isOperational = !loading && !error;

  return (
    <div className="animate-enter">

      {/* ── Sticky page header ─────────────────────────────────────────────── */}
      <header className="page-header">
        <div className="flex items-center gap-3">
          <h1 className="page-title">
            <span className="page-title-prefix">/</span>
            System
          </h1>

          {/* Status badge */}
          {loading ? (
            <div className="skeleton h-5 w-24 rounded" />
          ) : error ? (
            <span className="badge badge-red">UNREACHABLE</span>
          ) : (
            <span className="badge badge-green flex items-center gap-1.5">
              <span className="live-dot" style={{ width: 5, height: 5 }} />
              OPERATIONAL
            </span>
          )}
        </div>

        {/* Refresh */}
        <button
          onClick={load}
          disabled={loading}
          className="btn-ghost btn-sm"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>

      {/* ── Page content ───────────────────────────────────────────────────── */}
      <main className="page-content">

        {error && (
          <div className="alert-danger mb-5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
            <span>Backend unreachable — unable to load system information.</span>
          </div>
        )}

        <div className="grid xl:grid-cols-2 gap-6">

          {/* ── LEFT: Runtime info ─────────────────────────────────────────── */}
          <div className="panel p-0 overflow-hidden">
            {/* Panel chrome */}
            <div
              className="flex items-center gap-3 px-4 py-3 border-b"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
            >
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--signal-danger)", opacity: 0.7 }} />
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--signal-warn)",   opacity: 0.7 }} />
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--signal-ok)",     opacity: 0.7 }} />
              </div>
              <span className="cmd-label">Runtime</span>
              {isOperational && (
                <span
                  className="mono-value ml-auto"
                  style={{ fontSize: 10, color: "var(--text-3)" }}
                >
                  runtime.env
                </span>
              )}
            </div>

            <div className="px-5 py-4">
              {loading ? (
                /* Skeleton */
                <div className="space-y-3">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div className="skeleton h-3 rounded w-20 flex-shrink-0" />
                      <div className="skeleton h-3 rounded" style={{ width: `${45 + (i % 3) * 20}%` }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {runtimeRows.map(({ key, value, highlight }) => (
                    <div
                      key={key}
                      className="flex items-start gap-3 group px-2 py-1.5 rounded-md transition-colors"
                      style={{ borderRadius: 6 }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(0,200,150,0.03)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "")}
                    >
                      <span
                        className="mono-value flex-shrink-0 select-none"
                        style={{ fontSize: 11, color: "var(--text-3)", width: 88, textAlign: "right" }}
                      >
                        {key}
                      </span>
                      <span
                        className="mono-value"
                        style={{ fontSize: 11, color: "var(--border-2)" }}
                      >
                        ·
                      </span>
                      <span
                        className="mono-value break-all leading-relaxed"
                        style={{
                          fontSize: 11,
                          color: highlight ? "var(--xcore)" : "var(--text-1)",
                          fontWeight: highlight ? 500 : 400,
                        }}
                      >
                        {value ?? "—"}
                      </span>
                    </div>
                  ))}

                  {/* URL fields — code-block style */}
                  {urlRows.length > 0 && (
                    <div className="mt-3 pt-3 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
                      {urlRows.map(({ key, value }) => (
                        <div key={key}>
                          <div
                            className="mono-value mb-1 px-2"
                            style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.08em" }}
                          >
                            {key}
                          </div>
                          <div
                            className="code-block flex items-center justify-between gap-2"
                            style={{ padding: "8px 12px" }}
                          >
                            <span
                              className="mono-value truncate"
                              style={{ fontSize: 11, color: "var(--text-2)", flex: 1, minWidth: 0 }}
                              title={value}
                            >
                              {value ?? "—"}
                            </span>
                            <CopyButton value={value} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Database panel ──────────────────────────────────────── */}
          <div className="panel p-0 overflow-hidden">
            {/* Panel header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
            >
              <span className="cmd-label">Database</span>
              {!loading && db && (
                <span className="mono-value" style={{ fontSize: 10, color: "var(--text-3)" }}>
                  {dbTotal.toLocaleString()} rows total
                </span>
              )}
            </div>

            <div className="px-5 py-4">
              {loading ? (
                /* Skeleton */
                <div className="space-y-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="skeleton h-3 rounded w-36 flex-shrink-0" />
                      <div className="skeleton h-1.5 rounded-full flex-1" />
                      <div className="skeleton h-3 rounded w-12 flex-shrink-0" />
                    </div>
                  ))}
                </div>
              ) : db && (
                <div className="space-y-2.5">
                  {Object.entries(db).map(([table, count]) => {
                    const pct   = count !== null ? (count / dbMax) * 100 : 0;
                    const isErr = count === null;
                    return (
                      <div key={table} className="flex items-center gap-3">
                        {/* Table name */}
                        <span
                          className="mono-value flex-shrink-0 truncate text-right"
                          style={{
                            fontSize: 11,
                            width: 156,
                            color: isErr ? "var(--signal-danger)" : "var(--text-2)",
                          }}
                          title={table}
                        >
                          {table}
                        </span>

                        {/* Bar track */}
                        <div
                          className="flex-1 rounded-full overflow-hidden"
                          style={{ height: 5, background: "var(--surface-3)" }}
                        >
                          {!isErr && (
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${pct}%`,
                                minWidth: count! > 0 ? 3 : 0,
                                background: "rgba(0, 200, 150, 0.5)",
                              }}
                            />
                          )}
                        </div>

                        {/* Count */}
                        <span
                          className="mono-value flex-shrink-0 text-right"
                          style={{
                            fontSize: 11,
                            width: 52,
                            color: isErr ? "var(--signal-danger)" : "var(--text-1)",
                          }}
                        >
                          {isErr ? "err" : count!.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}

                  {/* Total row */}
                  <div
                    className="flex items-center gap-3 pt-2.5 mt-1"
                    style={{ borderTop: "1px solid var(--border)" }}
                  >
                    <span
                      className="mono-value flex-shrink-0 text-right"
                      style={{ fontSize: 11, width: 156, color: "var(--text-2)", fontWeight: 600 }}
                    >
                      TOTAL
                    </span>
                    {/* spacer */}
                    <div className="flex-1" />
                    <span
                      className="mono-value flex-shrink-0 text-right"
                      style={{ fontSize: 11, width: 52, color: "var(--xcore)", fontWeight: 600 }}
                    >
                      {dbTotal.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
