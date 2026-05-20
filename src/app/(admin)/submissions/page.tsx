"use client";

import { useEffect, useState, useCallback } from "react";
import { submissionsApi, type SubmissionAdminOut, type SubmissionStatus, AdminApiError } from "@/lib/admin-api";
import { RefreshCw, Search, CheckCircle, XCircle, Clock, Github, Upload, ChevronLeft, ChevronRight, Inbox } from "lucide-react";

const PAGE_SIZE = 50;

const SCORE_APPROVE = 20;
const SCORE_REJECT  = 80;

function scoreLevel(score: number | null): "ok" | "warn" | "danger" | "none" {
  if (score === null) return "none";
  if (score <= SCORE_APPROVE) return "ok";
  if (score < SCORE_REJECT)   return "warn";
  return "danger";
}

const LEVEL_COLOR: Record<string, string> = {
  ok:     "var(--signal-ok)",
  warn:   "var(--signal-warn)",
  danger: "var(--signal-danger)",
  none:   "var(--text-3)",
};

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending:       "En attente",
  processing:    "En cours",
  approved:      "Approuvée",
  rejected:      "Rejetée",
  manual_review: "Revue manuelle",
};

const STATUS_FILTER_OPTS: { value: string; label: string }[] = [
  { value: "",               label: "Toutes"      },
  { value: "pending",        label: "En attente"  },
  { value: "manual_review",  label: "Revue"       },
  { value: "approved",       label: "Approuvées"  },
  { value: "rejected",       label: "Rejetées"    },
];

// ── Score gauge ───────────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: number | null }) {
  const level = scoreLevel(score);

  if (score === null) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 w-16">
        <span className="mono-value text-xs" style={{ color: "var(--text-3)" }}>—</span>
        <div className="anomaly-bar w-12">
          <div className="anomaly-bar-fill" data-level="ok" style={{ width: "0%" }} />
        </div>
        <span className="anomaly-score text-[9px]" data-level="ok">N/A</span>
      </div>
    );
  }

  const scoreLabel = level === "ok" ? "SAFE" : level === "warn" ? "WARN" : "CRIT";

  return (
    <div className="flex flex-col items-center justify-center gap-1 w-16">
      <span
        className="anomaly-score font-bold leading-none"
        data-level={level}
        style={{ fontSize: 15 }}
      >
        {score}
      </span>
      <div className="anomaly-bar w-12">
        <div
          className="anomaly-bar-fill"
          data-level={level}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
      <span className="mono-value text-[9px] tracking-wider" data-level={level} style={{ color: LEVEL_COLOR[level] }}>
        {scoreLabel}
      </span>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SubmissionStatus }) {
  const cls: Record<SubmissionStatus, string> = {
    approved:      "status-approved",
    rejected:      "status-rejected",
    manual_review: "status-manual_review",
    pending:       "status-pending",
    processing:    "status-processing",
  };
  return <span className={cls[status]}>{STATUS_LABEL[status]}</span>;
}

// ── Submission row ────────────────────────────────────────────────────────────

function SubmissionRow({
  sub,
  onUpdated,
  index,
}: {
  sub: SubmissionAdminOut;
  onUpdated: (s: SubmissionAdminOut) => void;
  index: number;
}) {
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);

  const level = scoreLevel(sub.anomaly_score);
  const accentColor =
    sub.status === "manual_review" ? "var(--signal-warn)"
    : sub.status === "rejected"     ? "var(--signal-danger)"
    : sub.status === "approved"     ? "var(--signal-ok)"
    : LEVEL_COLOR[level];

  async function setStatus(newStatus: SubmissionStatus) {
    if (newStatus === sub.status || busy) return;
    setBusy(true); setErr(null);
    try {
      await submissionsApi.setStatus(sub.id, newStatus);
      onUpdated({ ...sub, status: newStatus });
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally { setBusy(false); }
  }

  const created = new Date(sub.created_at).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short",
  });

  const canApprove = sub.status !== "approved";
  const canReject  = sub.status !== "rejected";
  const canReview  = !["manual_review", "approved", "rejected"].includes(sub.status);

  return (
    <tr
      className="data-row animate-enter"
      style={{
        animationDelay: `${index * 30}ms`,
        borderLeft: `2px solid ${accentColor}`,
      }}
    >
      {/* Status + Plugin info */}
      <td className="py-3 pl-4 pr-3">
        <div className="flex flex-col gap-1.5">
          <StatusBadge status={sub.status} />
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
              {sub.plugin_name}
            </span>
            <span className="mono-value text-[10px]" style={{ color: "var(--text-3)" }}>
              v{sub.plugin_version}
            </span>
          </div>
        </div>
      </td>

      {/* Source chip */}
      <td className="py-3 px-3">
        <span
          className="inline-flex items-center gap-1 mono-value text-[10px] px-2 py-1 rounded"
          style={{
            background: "var(--surface-2)",
            color: "var(--text-3)",
            border: "1px solid var(--border)",
          }}
        >
          {sub.source === "github"
            ? <Github className="w-2.5 h-2.5" />
            : <Upload className="w-2.5 h-2.5" />}
          {sub.source}
        </span>
      </td>

      {/* Developer + Date */}
      <td className="py-3 px-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs truncate max-w-[180px]" style={{ color: "var(--text-2)" }}>
            {sub.developer_email ?? `${sub.developer_id.slice(0, 12)}…`}
          </span>
          <span className="mono-value text-[10px]" style={{ color: "var(--text-3)" }}>
            {created}
          </span>
        </div>
      </td>

      {/* Anomaly bar */}
      <td className="py-3 px-3">
        <div className="flex justify-center">
          <ScoreGauge score={sub.anomaly_score} />
        </div>
      </td>

      {/* Actions */}
      <td className="py-3 pl-3 pr-4">
        <div className="flex items-center justify-end gap-1.5">
          {err && (
            <span className="text-[10px] mono-value mr-1" style={{ color: "var(--signal-danger)" }}>
              {err}
            </span>
          )}
          {canApprove && (
            <button
              onClick={() => setStatus("approved")}
              disabled={busy}
              className="btn-xs btn-success"
              title="Approuver"
            >
              <CheckCircle className="w-3 h-3" />
              OK
            </button>
          )}
          {canReview && (
            <button
              onClick={() => setStatus("manual_review")}
              disabled={busy}
              className="btn-xs btn-warn"
              title="Marquer revue manuelle"
            >
              <Clock className="w-3 h-3" />
              Revue
            </button>
          )}
          {canReject && (
            <button
              onClick={() => setStatus("rejected")}
              disabled={busy}
              className="btn-xs btn-danger"
              title="Rejeter"
            >
              <XCircle className="w-3 h-3" />
              KO
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Skeleton rows ─────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="data-row">
          <td className="py-3 pl-4 pr-3">
            <div className="flex flex-col gap-2">
              <div className="skeleton h-4 w-16 rounded" style={{ animationDelay: `${i * 60}ms` }} />
              <div className="skeleton h-3 w-32 rounded" style={{ animationDelay: `${i * 60 + 20}ms` }} />
            </div>
          </td>
          <td className="py-3 px-3">
            <div className="skeleton h-5 w-16 rounded" style={{ animationDelay: `${i * 60 + 10}ms` }} />
          </td>
          <td className="py-3 px-3">
            <div className="flex flex-col gap-1">
              <div className="skeleton h-3 w-28 rounded" style={{ animationDelay: `${i * 60 + 30}ms` }} />
              <div className="skeleton h-3 w-14 rounded" style={{ animationDelay: `${i * 60 + 40}ms` }} />
            </div>
          </td>
          <td className="py-3 px-3">
            <div className="flex justify-center">
              <div className="skeleton h-8 w-14 rounded" style={{ animationDelay: `${i * 60 + 20}ms` }} />
            </div>
          </td>
          <td className="py-3 pl-3 pr-4">
            <div className="flex justify-end gap-1.5">
              <div className="skeleton h-6 w-12 rounded" style={{ animationDelay: `${i * 60 + 50}ms` }} />
              <div className="skeleton h-6 w-14 rounded" style={{ animationDelay: `${i * 60 + 60}ms` }} />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

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
  const hasMore    = page < totalPages;

  return (
    <div>

      {/* ── Sticky header ──────────────────────────────────────────────────── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div>
            <p className="page-title-prefix">Admin / Triage</p>
            <h1 className="page-title">
              Submissions
              {!loading && (
                <span
                  className="mono-value ml-3 text-sm font-normal px-2 py-0.5 rounded"
                  style={{
                    background: "var(--xcore-dim)",
                    color: "var(--xcore)",
                    border: "1px solid var(--xcore-glow)",
                    verticalAlign: "middle",
                  }}
                >
                  {total.toLocaleString("fr-FR")}
                </span>
              )}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3"
              style={{ color: "var(--text-3)" }}
            />
            <input
              type="text"
              placeholder="plugin, email…"
              value={search}
              onChange={e => { setSearch(e.target.value); setOffset(0); }}
              className="input pl-8 py-1.5 text-xs w-48"
            />
          </div>

          {/* Refresh */}
          <button onClick={load} disabled={loading} className="btn-ghost btn-sm" title="Rafraîchir">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="page-content">

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="filter-bar">
        {/* Status chips */}
        {STATUS_FILTER_OPTS.map(opt => (
          <button
            key={opt.value}
            onClick={() => { setStatus(opt.value); setOffset(0); }}
            className={`filter-chip${status === opt.value ? " active" : ""}`}
          >
            {opt.value === "pending"       && <span className="live-dot" style={{ background: "var(--signal-pending)" }} />}
            {opt.value === "manual_review" && <span className="live-dot" style={{ background: "var(--signal-warn)" }} />}
            {opt.value === "approved"      && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--signal-ok)", marginRight: 2 }} />}
            {opt.value === "rejected"      && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--signal-danger)", marginRight: 2 }} />}
            {opt.label}
          </button>
        ))}

        <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch", margin: "0 4px" }} />

        {/* Source chips */}
        {(["", "github", "upload"] as const).map(src => (
          <button
            key={src}
            onClick={() => { setSource(src); setOffset(0); }}
            className={`filter-chip${source === src ? " active" : ""}`}
          >
            {src === "github" && <Github className="w-2.5 h-2.5" />}
            {src === "upload" && <Upload className="w-2.5 h-2.5" />}
            {src === "" ? "Toutes sources" : src}
          </button>
        ))}
      </div>

      {/* ── Data table ─────────────────────────────────────────────────────── */}
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        <table className="data-table w-full">
          <thead>
            <tr>
              <th className="col-head pl-4" style={{ width: "32%" }}>Plugin</th>
              <th className="col-head" style={{ width: "10%" }}>Source</th>
              <th className="col-head" style={{ width: "22%" }}>Développeur</th>
              <th className="col-head text-center" style={{ width: "14%" }}>Score anomalie</th>
              <th className="col-head text-right pr-4" style={{ width: "22%" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows />
            ) : subs.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div
                    className="py-16 text-center"
                    style={{ color: "var(--text-3)" }}
                  >
                    <Inbox className="w-8 h-8 mx-auto mb-3 opacity-25" />
                    <p className="text-sm" style={{ color: "var(--text-2)" }}>
                      Aucune soumission trouvée.
                    </p>
                    {(status || source || search) && (
                      <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>
                        Essayez de modifier vos filtres.
                      </p>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              subs.map((s, i) => (
                <SubmissionRow
                  key={s.id}
                  sub={s}
                  index={i}
                  onUpdated={updated =>
                    setSubs(prev => prev.map(x => x.id === updated.id ? updated : x))
                  }
                />
              ))
            )}
          </tbody>
        </table>

        {/* ── Pagination ───────────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <span className="mono-value text-xs" style={{ color: "var(--text-3)" }}>
              Page{" "}
              <span style={{ color: "var(--text-2)" }}>{page}</span>
              {" / "}
              <span style={{ color: "var(--text-2)" }}>{totalPages}</span>
              <span className="ml-2">
                · {total.toLocaleString("fr-FR")} résultats
              </span>
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
                disabled={offset === 0}
                className="btn-outline btn-sm"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Préc.
              </button>
              <button
                onClick={() => setOffset(o => o + PAGE_SIZE)}
                disabled={!hasMore}
                className="btn-outline btn-sm"
              >
                Suiv.
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      </div>{/* /page-content */}
    </div>
  );
}
