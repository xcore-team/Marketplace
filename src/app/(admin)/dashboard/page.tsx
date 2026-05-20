"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { statsApi, type GlobalStatsOut, AdminApiError } from "@/lib/admin-api";
import {
  RefreshCw, Send, Loader2, CheckCircle, ArrowRight,
  AlertTriangle,
} from "lucide-react";

// ── Metric tile ───────────────────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  sub,
  alert,
  loading,
  href,
  accent,
}: {
  label: string;
  value: number;
  sub?: string;
  alert?: boolean;
  loading: boolean;
  href?: string;
  accent: "accent-green" | "accent-amber" | "accent-blue" | "accent-neutral";
}) {
  const numColor = alert && value > 0 ? "var(--signal-warn)" : "var(--text-1)";

  const inner = (
    <div className={`metric-card ${accent} flex flex-col gap-3`}>
      {loading ? (
        <>
          <div className="skeleton h-9 w-20 rounded mb-1" />
          <div className="skeleton h-3 w-24 rounded" />
        </>
      ) : (
        <>
          <div
            className="stat-readout transition-colors"
            style={{ color: numColor }}
          >
            {value.toLocaleString("fr-FR")}
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="cmd-label">{label}</span>
            {sub && (
              <span
                className="mono-value"
                style={{
                  fontSize: 11,
                  color: alert && value > 0 ? "var(--signal-warn)" : "var(--text-3)",
                }}
              >
                {sub}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );

  if (href && !loading && value > 0) {
    return (
      <Link href={href} className="group block">
        {inner}
      </Link>
    );
  }
  return inner;
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

function Pipeline({ stats, loading }: { stats: GlobalStatsOut | null; loading: boolean }) {
  const total = Math.max(stats?.submissions_total ?? 1, 1);

  const rows = [
    {
      key:   "approved",
      label: "Approuvées",
      value: stats?.submissions_approved ?? 0,
      color: "var(--xcore)",
    },
    {
      key:   "pending",
      label: "En attente",
      value: stats?.submissions_pending ?? 0,
      color: "var(--signal-warn)",
    },
    {
      key:   "review",
      label: "Revue manuelle",
      value: stats?.submissions_manual_review ?? 0,
      color: "var(--signal-warn)",
    },
    {
      key:   "rejected",
      label: "Rejetées",
      value: stats?.submissions_rejected ?? 0,
      color: "var(--signal-danger)",
    },
  ];

  const actionCount = (stats?.submissions_pending ?? 0) + (stats?.submissions_manual_review ?? 0);

  return (
    <div>
      {/* Sub-header */}
      <div className="flex items-baseline justify-between mb-5">
        <span className="cmd-label">Soumissions</span>
        <div className="flex items-baseline gap-1.5">
          {loading ? (
            <div className="skeleton h-7 w-12 rounded" />
          ) : (
            <>
              <span className="stat-readout-sm">
                {(stats?.submissions_total ?? 0).toLocaleString("fr-FR")}
              </span>
              <span className="mono-value" style={{ fontSize: 10, color: "var(--text-3)" }}>total</span>
            </>
          )}
        </div>
      </div>

      {/* Thin composite bar — 2px, xcore color segments */}
      <div
        className="flex overflow-hidden gap-px mb-6"
        style={{ height: 2, background: "var(--surface-3)", borderRadius: 2 }}
      >
        {loading ? (
          <div className="skeleton flex-1" style={{ height: 2 }} />
        ) : rows.map(r => r.value > 0 && (
          <div
            key={r.key}
            style={{
              width: `${(r.value / total) * 100}%`,
              background: r.color,
              minWidth: 3,
              transition: "width 1s cubic-bezier(0.4,0,0.2,1)",
            }}
          />
        ))}
      </div>

      {/* Breakdown */}
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton h-3 w-28 rounded" />
              <div className="skeleton h-px flex-1 rounded-full" />
              <div className="skeleton h-3 w-10 rounded" />
            </div>
          ))
        ) : rows.map(r => {
          const pct = Math.round((r.value / total) * 100);
          const isAction = r.key === "pending" || r.key === "review";
          return (
            <div key={r.key} className="flex items-center gap-3">
              <span
                className="mono-value w-32 flex-shrink-0"
                style={{
                  fontSize: 11,
                  color: isAction && r.value > 0 ? r.color : "var(--text-2)",
                }}
              >
                {r.label}
              </span>
              <div className="flex-1 rounded-full" style={{ height: 1, background: "var(--surface-3)" }}>
                {r.value > 0 && (
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${pct}%`, background: r.color, opacity: isAction && r.value > 0 ? 1 : 0.5 }}
                  />
                )}
              </div>
              <span
                className="mono-value font-semibold w-8 text-right flex-shrink-0"
                style={{
                  fontSize: 13,
                  color: isAction && r.value > 0 ? r.color : "var(--text-1)",
                }}
              >
                {r.value}
              </span>
              <span
                className="mono-value w-7 text-right flex-shrink-0"
                style={{ fontSize: 10, color: "var(--text-3)" }}
              >
                {pct}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Action link */}
      {!loading && actionCount > 0 && (
        <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Link
            href="/submissions"
            className="flex items-center gap-2 group"
            style={{ color: "var(--signal-warn)" }}
          >
            <span className="mono-value" style={{ fontSize: 11, color: "var(--signal-warn)" }}>
              {actionCount} soumission{actionCount > 1 ? "s" : ""} nécessite{actionCount === 1 ? "" : "nt"} une action
            </span>
            <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Platform ratios ────────────────────────────────────────────────────────────

function PlatformRatios({ stats, loading }: { stats: GlobalStatsOut | null; loading: boolean }) {
  const devActive     = stats ? Math.round((stats.users_active   / Math.max(stats.users_total,   1)) * 100) : 0;
  const plugPublished = stats ? Math.round((stats.plugins_published / Math.max(stats.plugins_total, 1)) * 100) : 0;

  const items = [
    {
      label: "Développeurs",
      total: stats?.users_total       ?? 0,
      sub:   stats?.users_active      ?? 0,
      subLabel: "actifs",
      pct:   devActive,
    },
    {
      label: "Plugins",
      total: stats?.plugins_total     ?? 0,
      sub:   stats?.plugins_published ?? 0,
      subLabel: "publiés",
      pct:   plugPublished,
    },
    {
      label: "Catégories",
      total: stats?.categories_total  ?? 0,
      sub:   null,
      subLabel: "",
      pct:   null,
    },
  ];

  return (
    <div className="space-y-5">
      <span className="cmd-label">Plateforme</span>

      <div className="space-y-5 mt-4">
        {items.map(item => (
          <div key={item.label}>
            <div className="flex items-baseline justify-between mb-2">
              <span className="mono-value" style={{ fontSize: 11, color: "var(--text-2)" }}>
                {item.label}
              </span>
              <div className="flex items-baseline gap-1.5">
                {loading ? (
                  <div className="skeleton h-4 w-12 rounded" />
                ) : (
                  <>
                    <span className="stat-readout-sm">
                      {item.total.toLocaleString("fr-FR")}
                    </span>
                    {item.sub !== null && (
                      <span className="mono-value" style={{ fontSize: 10, color: "var(--xcore)" }}>
                        {item.sub} {item.subLabel}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
            {item.pct !== null && (
              <div className="rounded-full" style={{ height: 1, background: "var(--surface-3)" }}>
                {!loading && (
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${item.pct}%`, background: "var(--xcore)", opacity: 0.7 }}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Broadcast ──────────────────────────────────────────────────────────────────

function Broadcast() {
  const [msg,     setMsg]     = useState("");
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [err,     setErr]     = useState<string | null>(null);

  async function send() {
    if (!msg.trim()) return;
    setSending(true); setSent(false); setErr(null);
    try {
      await statsApi.broadcast(msg.trim());
      setSent(true);
      setMsg("");
      setTimeout(() => setSent(false), 3000);
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur d'envoi");
    } finally { setSending(false); }
  }

  return (
    <div>
      <span className="cmd-label">Broadcast</span>

      <div className="mt-4 space-y-2">
        <textarea
          value={msg}
          onChange={e => setMsg(e.target.value)}
          rows={2}
          placeholder="Message à tous les connectés…"
          className="input-mono resize-none"
          style={{ fontSize: 11 }}
          onKeyDown={e => { if (e.key === "Enter" && e.metaKey) send(); }}
        />
        <div className="flex gap-2">
          <button onClick={send} disabled={sending || !msg.trim()} className="btn-primary btn-sm flex-shrink-0 w-full">
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Envoyer
          </button>
        </div>
        {sent && (
          <p className="flex items-center gap-1.5 mono-value" style={{ fontSize: 11, color: "var(--signal-ok)" }}>
            <CheckCircle className="w-3 h-3" /> Diffusé.
          </p>
        )}
        {err && (
          <p className="mono-value" style={{ fontSize: 11, color: "var(--signal-danger)" }}>{err}</p>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats,   setStats]   = useState<GlobalStatsOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  async function load() {
    setLoading(true); setError(false);
    try { setStats(await statsApi.global()); }
    catch { setError(true); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const actionCount = (stats?.submissions_pending ?? 0) + (stats?.submissions_manual_review ?? 0);

  return (
    <div>
      {/* Sticky page header */}
      <div className="page-header">
        <div className="flex items-center gap-2.5">
          <span className="live-dot" />
          <h1 className="page-title">Vue d'ensemble</h1>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Page content */}
      <div className="page-content animate-enter">
        <div className="max-w-6xl space-y-6">

          {/* Error */}
          {error && (
            <div className="alert-danger">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Impossible de charger les statistiques.
            </div>
          )}

          {/* Action alert strip */}
          {!loading && actionCount > 0 && (
            <Link
              href="/submissions"
              className="alert-warn flex items-center justify-between group transition-colors hover:opacity-90"
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span className="mono-value font-medium" style={{ fontSize: 12, color: "#D4A050" }}>
                  {actionCount} soumission{actionCount > 1 ? "s" : ""} nécessite{actionCount === 1 ? "" : "nt"} votre attention
                </span>
                <span className="mono-value" style={{ fontSize: 10, color: "var(--text-3)" }}>
                  {stats?.submissions_pending ? `${stats.submissions_pending} en attente` : ""}
                  {stats?.submissions_pending && stats?.submissions_manual_review ? " · " : ""}
                  {stats?.submissions_manual_review ? `${stats.submissions_manual_review} en revue` : ""}
                </span>
              </div>
              <ArrowRight
                className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 flex-shrink-0"
                style={{ color: "var(--signal-warn)" }}
              />
            </Link>
          )}

          {/* 4 metric cards grid */}
          <div className="grid grid-cols-4 gap-3 stagger">
            <MetricTile
              label="Développeurs"
              value={stats?.users_total ?? 0}
              sub={`${stats?.users_active ?? 0} actifs`}
              loading={loading}
              href="/users"
              accent="accent-green"
            />
            <MetricTile
              label="Plugins publiés"
              value={stats?.plugins_published ?? 0}
              sub={`/ ${stats?.plugins_total ?? 0} total`}
              loading={loading}
              href="/plugins"
              accent="accent-blue"
            />
            <MetricTile
              label="En attente"
              value={actionCount}
              sub={actionCount > 0 ? "action requise" : "tout traité"}
              alert
              loading={loading}
              href="/submissions"
              accent="accent-amber"
            />
            <div className="metric-card accent-neutral flex flex-col gap-3">
              {loading ? (
                <>
                  <div className="skeleton h-9 w-10 rounded mb-1" />
                  <div className="skeleton h-3 w-20 rounded" />
                </>
              ) : (
                <>
                  <div className="stat-readout">
                    {(stats?.categories_total ?? 0)}
                  </div>
                  <span className="cmd-label">Catégories</span>
                </>
              )}
            </div>
          </div>

          {/* Main content — two-column layout (3fr 2fr) */}
          <div
            className="grid gap-px rounded-xl overflow-hidden"
            style={{
              gridTemplateColumns: "3fr 2fr",
              background: "var(--border)",
              border: "1px solid var(--border)",
            }}
          >
            {/* Left — Pipeline chart panel */}
            <div className="p-6" style={{ background: "var(--surface)" }}>
              <Pipeline stats={stats} loading={loading} />
            </div>

            {/* Right column — Platform ratios + Broadcast stacked */}
            <div
              className="flex flex-col"
              style={{ background: "var(--surface)" }}
            >
              <div
                className="p-6 flex-1"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <PlatformRatios stats={stats} loading={loading} />
              </div>
              <div className="p-6">
                <Broadcast />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
