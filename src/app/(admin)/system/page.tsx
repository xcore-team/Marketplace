"use client";

import { useEffect, useState } from "react";
import { systemApi, type SystemInfo } from "@/lib/admin-api";
import { RefreshCw, Server, Database, AlertTriangle } from "lucide-react";

export default function SystemPage() {
  const [info, setInfo]   = useState<SystemInfo | null>(null);
  const [db, setDb]       = useState<Record<string, number | null> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const [infoRes, dbRes] = await Promise.all([systemApi.info(), systemApi.db()]);
      setInfo(infoRes);
      setDb(dbRes);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--text-1)" }}>
            Système
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-3)" }}>
            Informations runtime et statistiques base de données
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {error && (
        <div className="alert-danger flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Impossible de charger les informations système.
        </div>
      )}

      {/* System info */}
      <div className="panel p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Server className="w-4 h-4" style={{ color: "var(--xcore)" }} />
          <h2 className="section-label">Runtime</h2>
        </div>

        {loading
          ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-5 rounded" />)}</div>
          : info && (
            <dl className="space-y-2.5">
              {[
                { label: "Python",   value: info.python },
                { label: "Platform", value: info.platform },
                { label: "PID",      value: String(info.pid) },
                { label: "APP_NAME", value: info.env.APP_NAME },
                { label: "DATABASE_URL", value: info.env.DATABASE_URL },
                { label: "SANDBOX_MEMORY_MB",  value: info.env.SANDBOX_MEMORY_MB  ?? "—" },
                { label: "SANDBOX_CPU_SECONDS", value: info.env.SANDBOX_CPU_SECONDS ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start gap-4">
                  <dt className="w-44 text-xs flex-shrink-0" style={{ color: "var(--text-3)" }}>{label}</dt>
                  <dd className="mono-value text-xs break-all" style={{ color: "var(--text-1)" }}>{value}</dd>
                </div>
              ))}
            </dl>
          )}
      </div>

      {/* DB table counts */}
      <div className="panel p-5">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4" style={{ color: "var(--xcore)" }} />
          <h2 className="section-label">Tables</h2>
        </div>

        {loading
          ? <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-7 rounded" />)}</div>
          : db && (
            <div className="space-y-1.5">
              {Object.entries(db).map(([table, count]) => (
                <div
                  key={table}
                  className="flex items-center justify-between px-3 py-2 rounded-lg"
                  style={{ background: "var(--surface-2)" }}
                >
                  <span className="mono-value text-xs" style={{ color: "var(--text-2)" }}>{table}</span>
                  <span className="mono-value text-xs font-semibold" style={{ color: count !== null ? "var(--text-1)" : "var(--signal-danger)" }}>
                    {count !== null ? count.toLocaleString("fr-FR") : "erreur"}
                  </span>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
