"use client";

import { useEffect, useState } from "react";
import { statsApi, type GlobalStatsOut, AdminApiError } from "@/lib/admin-api";
import {
  Users, Puzzle, ClipboardList, Tag,
  CheckCircle, Clock, XCircle, AlertTriangle, RefreshCw,
  Radio, Send, Loader2,
} from "lucide-react";

// ── Stat card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  color?: string;
}

function StatCard({ label, value, sub, icon: Icon, color = "var(--xcore)" }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between mb-3">
        <div
          className="flex items-center justify-center w-9 h-9 rounded-xl"
          style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 25%, transparent)` }}
        >
          <Icon className="w-4.5 h-4.5" style={{ color, width: 18, height: 18 }} />
        </div>
      </div>
      <div className="font-display text-2xl font-bold" style={{ color: "var(--text-1)" }}>
        {typeof value === "number" ? value.toLocaleString("fr-FR") : value}
      </div>
      <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{label}</div>
      {sub && <div className="text-xs mt-1 mono-value" style={{ color: "var(--text-3)" }}>{sub}</div>}
    </div>
  );
}

// ── Submission breakdown row ──────────────────────────────────────────────────

function StatusRow({
  label, value, total, color,
}: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-xs" style={{ color: "var(--text-2)" }}>{label}</div>
      <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--surface-2)" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="w-12 text-right mono-value text-xs" style={{ color: "var(--text-3)" }}>
        {value.toLocaleString("fr-FR")}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

// ── Broadcast panel ───────────────────────────────────────────────────────────

function BroadcastPanel() {
  const [message,  setMessage]  = useState("");
  const [event,    setEvent]    = useState("ADMIN_BROADCAST");
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [err,      setErr]      = useState<string | null>(null);

  async function handleSend() {
    if (!message.trim()) return;
    setSending(true);
    setSent(false);
    setErr(null);
    try {
      await statsApi.broadcast(message.trim(), event.trim() || "ADMIN_BROADCAST");
      setSent(true);
      setMessage("");
      setTimeout(() => setSent(false), 3000);
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur d'envoi");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="panel p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Radio className="w-4 h-4" style={{ color: "var(--xcore)" }} />
        <h2 className="section-label">Broadcast</h2>
        <span className="text-xs" style={{ color: "var(--text-3)" }}>
          — diffuse un message à tous les utilisateurs connectés via WebSocket
        </span>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "1fr auto" }}>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={2}
          placeholder="Message à diffuser…"
          className="input text-xs resize-none"
          onKeyDown={e => { if (e.key === "Enter" && e.metaKey) handleSend(); }}
        />
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={event}
            onChange={e => setEvent(e.target.value)}
            className="input py-1 text-xs mono-value"
            placeholder="event type"
            style={{ minWidth: 160 }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="btn-primary btn-sm justify-center"
            style={{ padding: "6px 16px" }}
          >
            {sending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Send className="w-3.5 h-3.5" />}
            Envoyer
          </button>
        </div>
      </div>

      {sent && (
        <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--signal-ok)" }}>
          <CheckCircle className="w-3.5 h-3.5" /> Broadcast envoyé.
        </p>
      )}
      {err && (
        <p className="text-xs" style={{ color: "var(--signal-danger)" }}>{err}</p>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats]   = useState<GlobalStatsOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      setStats(await statsApi.global());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--text-1)" }}>
            Vue d'ensemble
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-3)" }}>
            Statistiques globales de la plateforme
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {error && (
        <div className="alert-danger flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Impossible de charger les statistiques. Vérifiez que le backend est démarré.
        </div>
      )}

      {/* Primary grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Utilisateurs total"
          value={loading ? "—" : (stats?.users_total ?? 0)}
          sub={`${loading ? "—" : (stats?.users_active ?? 0).toLocaleString("fr-FR")} actifs`}
          icon={Users}
          color="var(--xcore)"
        />
        <StatCard
          label="Plugins publiés"
          value={loading ? "—" : (stats?.plugins_published ?? 0)}
          sub={`${loading ? "—" : (stats?.plugins_total ?? 0).toLocaleString("fr-FR")} total`}
          icon={Puzzle}
          color="var(--signal-pending)"
        />
        <StatCard
          label="Soumissions total"
          value={loading ? "—" : (stats?.submissions_total ?? 0)}
          sub={`${loading ? "—" : (stats?.submissions_pending ?? 0).toLocaleString("fr-FR")} en attente`}
          icon={ClipboardList}
          color="var(--signal-warn)"
        />
        <StatCard
          label="Catégories"
          value={loading ? "—" : (stats?.categories_total ?? 0)}
          icon={Tag}
          color="var(--xcore-mint)"
        />
      </div>

      {/* Submission breakdown */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="panel p-5">
          <h2 className="section-label mb-5">Statuts des soumissions</h2>
          {loading
            ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-5 rounded" />)}</div>
            : (
              <div className="space-y-3">
                <StatusRow label="Approuvées"    value={stats?.submissions_approved      ?? 0} total={stats?.submissions_total ?? 1} color="var(--signal-ok)" />
                <StatusRow label="Revue manuelle" value={stats?.submissions_manual_review ?? 0} total={stats?.submissions_total ?? 1} color="var(--signal-warn)" />
                <StatusRow label="Rejetées"      value={stats?.submissions_rejected      ?? 0} total={stats?.submissions_total ?? 1} color="var(--signal-danger)" />
                <StatusRow label="En attente"    value={stats?.submissions_pending       ?? 0} total={stats?.submissions_total ?? 1} color="var(--signal-pending)" />
              </div>
            )
          }
        </div>

        <div className="panel p-5">
          <h2 className="section-label mb-5">Statuts des plugins</h2>
          {loading
            ? <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="skeleton h-5 rounded" />)}</div>
            : (
              <div className="space-y-3">
                <StatusRow label="Publiés"   value={stats?.plugins_published ?? 0} total={stats?.plugins_total ?? 1} color="var(--signal-ok)" />
                <StatusRow label="Non publiés" value={(stats?.plugins_total ?? 0) - (stats?.plugins_published ?? 0)} total={stats?.plugins_total ?? 1} color="var(--text-3)" />
              </div>
            )
          }

          <div className="divider-xcore mt-6 mb-5" />

          <h2 className="section-label mb-3">Utilisateurs</h2>
          {loading
            ? <div className="skeleton h-5 rounded" />
            : (
              <StatusRow label="Actifs" value={stats?.users_active ?? 0} total={stats?.users_total ?? 1} color="var(--signal-ok)" />
            )
          }
        </div>
      </div>

      {/* Quick status summary */}
      <div className="panel p-5 flex flex-wrap gap-6">
        {[
          { icon: CheckCircle, label: "Approuvées",     value: stats?.submissions_approved,      color: "var(--signal-ok)" },
          { icon: Clock,       label: "En attente",     value: stats?.submissions_pending,        color: "var(--signal-pending)" },
          { icon: AlertTriangle, label: "Revue manuelle", value: stats?.submissions_manual_review, color: "var(--signal-warn)" },
          { icon: XCircle,     label: "Rejetées",       value: stats?.submissions_rejected,       color: "var(--signal-danger)" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="flex items-center gap-2.5">
            <Icon className="w-4 h-4" style={{ color }} />
            <span className="text-sm" style={{ color: "var(--text-2)" }}>{label}</span>
            <span className="mono-value text-sm font-semibold" style={{ color: "var(--text-1)" }}>
              {loading ? "—" : (value ?? 0).toLocaleString("fr-FR")}
            </span>
          </div>
        ))}
      </div>

      {/* Broadcast */}
      <BroadcastPanel />
    </div>
  );
}
