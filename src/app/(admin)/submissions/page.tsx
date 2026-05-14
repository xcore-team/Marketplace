"use client";

import { useEffect, useState, useCallback } from "react";
import { submissionsApi, type SubmissionAdminOut, type SubmissionStatus, AdminApiError } from "@/lib/admin-api";
import { RefreshCw, ChevronLeft, ChevronRight, Search } from "lucide-react";

const PAGE_SIZE = 50;

// Pipeline scoring thresholds (from backend/pipelines/models.py)
const ANOMALY_AUTO_APPROVE = 20;
const ANOMALY_HIGH_PRIORITY = 50;
// ANOMALY_AUTO_REJECT = 80 (anything above high priority)

function AnomalyBar({ score }: { score: number | null }) {
  if (score === null) return <span style={{ color: "var(--text-3)" }}>—</span>;
  const level =
    score <= ANOMALY_AUTO_APPROVE  ? "ok"
    : score <= ANOMALY_HIGH_PRIORITY ? "warn"
    : "danger";
  return (
    <div className="flex items-center gap-2">
      <div className="anomaly-bar" style={{ width: 64 }}>
        <div className="anomaly-bar-fill" data-level={level} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className={`anomaly-score mono-value text-xs`} data-level={level}>
        {score}
      </span>
    </div>
  );
}

const STATUS_OPTS: SubmissionStatus[] = ["pending", "processing", "approved", "rejected", "manual_review"];

function SubmissionRow({
  sub,
  onUpdated,
}: {
  sub: SubmissionAdminOut;
  onUpdated: (s: SubmissionAdminOut) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState<string | null>(null);

  async function setStatus(newStatus: SubmissionStatus) {
    if (newStatus === sub.status) return;
    setBusy(true);
    setErr(null);
    try {
      await submissionsApi.setStatus(sub.id, newStatus);
      onUpdated({ ...sub, status: newStatus });
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const created = new Date(sub.created_at).toLocaleDateString("fr-FR");

  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      {/* Plugin */}
      <td className="px-4 py-3">
        <div className="text-xs font-medium" style={{ color: "var(--text-1)" }}>{sub.plugin_name}</div>
        <div className="text-[10px] mono-value mt-0.5" style={{ color: "var(--text-3)" }}>v{sub.plugin_version}</div>
      </td>

      {/* Developer */}
      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-2)" }}>
        {sub.developer_email ?? sub.developer_id.slice(0, 8) + "…"}
      </td>

      {/* Source */}
      <td className="px-4 py-3">
        <span className="mono-value text-xs" style={{ color: "var(--text-3)" }}>
          {sub.source}
        </span>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <span className={`status-${sub.status}`}>{sub.status.replace("_", " ")}</span>
      </td>

      {/* Anomaly score */}
      <td className="px-4 py-3">
        <AnomalyBar score={sub.anomaly_score} />
      </td>

      {/* Date */}
      <td className="px-4 py-3 mono-value text-xs" style={{ color: "var(--text-3)" }}>
        {created}
      </td>

      {/* Change status */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {err && <span className="text-[10px]" style={{ color: "var(--signal-danger)" }}>{err}</span>}
          <select
            value={sub.status}
            onChange={e => setStatus(e.target.value as SubmissionStatus)}
            disabled={busy}
            className="input py-0.5 text-xs"
            style={{ width: "auto", minWidth: 130, fontSize: 11 }}
          >
            {STATUS_OPTS.map(s => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
        </div>
      </td>
    </tr>
  );
}

export default function SubmissionsPage() {
  const [subs, setSubs]       = useState<SubmissionAdminOut[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset]   = useState(0);
  const [search, setSearch]   = useState("");
  const [status, setStatus]   = useState<string>("");
  const [source, setSource]   = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: {
        status?: SubmissionStatus;
        source?: string;
        search?: string;
        limit: number;
        offset: number;
      } = { limit: PAGE_SIZE, offset };
      if (status) params.status = status as SubmissionStatus;
      if (source) params.source = source;
      if (search) params.search = search;
      const res = await submissionsApi.list(params);
      setSubs(res.items);
      setTotal(res.total);
    } catch {
      setSubs([]);
    } finally {
      setLoading(false);
    }
  }, [offset, search, status, source]);

  useEffect(() => { load(); }, [load]);

  const page       = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--text-1)" }}>
            Soumissions
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-3)" }}>
            {total.toLocaleString("fr-FR")} soumissions
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="panel p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--text-3)" }} />
          <input
            type="text"
            placeholder="Rechercher par nom de plugin…"
            value={search}
            onChange={e => { setSearch(e.target.value); setOffset(0); }}
            className="input pl-8 py-2 text-xs"
          />
        </div>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setOffset(0); }}
          className="input py-1.5 text-xs"
          style={{ width: "auto", minWidth: 140 }}
        >
          <option value="">Tous les statuts</option>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <select
          value={source}
          onChange={e => { setSource(e.target.value); setOffset(0); }}
          className="input py-1.5 text-xs"
          style={{ width: "auto", minWidth: 110 }}
        >
          <option value="">Toutes sources</option>
          <option value="upload">upload</option>
          <option value="github">github</option>
        </select>
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Plugin", "Développeur", "Source", "Statut", "Score", "Date", "Modifier"].map(h => (
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
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="skeleton h-4 rounded" style={{ width: j === 3 ? 80 : 90 }} />
                      </td>
                    ))}
                  </tr>
                ))
              : subs.map(s => (
                  <SubmissionRow
                    key={s.id}
                    sub={s}
                    onUpdated={updated => setSubs(prev => prev.map(x => x.id === updated.id ? updated : x))}
                  />
                ))}
          </tbody>
        </table>
        {!loading && subs.length === 0 && (
          <div className="py-16 text-center text-sm" style={{ color: "var(--text-3)" }}>
            Aucune soumission trouvée.
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--text-3)" }}>Page {page} / {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))} disabled={offset === 0} className="btn-outline btn-sm">
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setOffset(o => o + PAGE_SIZE)} disabled={page >= totalPages} className="btn-outline btn-sm">
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
