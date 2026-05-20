"use client";

import Link from "next/link";
import { Bell, BellOff, CheckCheck, WifiOff, RefreshCw, ExternalLink } from "lucide-react";
import { useAdminNotifications, type AdminNotification } from "@/hooks/useAdminNotifications";

const CHANNEL_META: Record<string, { color: string; dim: string; border: string }> = {
  admin:     { color: "var(--signal-warn)",    dim: "var(--signal-warn-dim)",    border: "var(--signal-warn-border)"    },
  broadcast: { color: "var(--xcore)",          dim: "var(--xcore-dim)",          border: "var(--xcore-glow)"            },
};

function channelMeta(ch: string) {
  return CHANNEL_META[ch] ?? CHANNEL_META.broadcast;
}

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60)   return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

function NotifRow({ n }: { n: AdminNotification }) {
  const m = channelMeta(n.channel);
  const baseStyle = {
    borderBottom: "1px solid var(--border)",
    borderLeft: `2px solid ${n.read ? "transparent" : m.color}`,
    background: n.read ? "transparent" : `color-mix(in srgb, ${m.color} 3%, transparent)`,
  };

  const inner = (
    <>
      {/* Unread dot */}
      <div className="flex-shrink-0 mt-1" style={{ width: 6 }}>
        {!n.read && (
          <span className="block rounded-full" style={{ width: 6, height: 6, background: m.color }} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="mono-value font-semibold"
            style={{
              fontSize: 9, letterSpacing: "0.1em", padding: "1px 6px", borderRadius: 3,
              background: m.dim, color: m.color, border: `1px solid ${m.border}`,
            }}
          >
            {n.channel}
          </span>
          <span className="mono-value" style={{ fontSize: 9, letterSpacing: "0.06em", color: "var(--text-3)" }}>
            {n.event}
          </span>
        </div>
        <p className="text-sm leading-snug" style={{ color: n.read ? "var(--text-2)" : "var(--text-1)" }}>
          {n.text}
        </p>
      </div>

      {/* Time + link icon */}
      <div className="flex-shrink-0 flex items-center gap-1.5 self-start" style={{ marginTop: 2 }}>
        {n.href && (
          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: m.color }} />
        )}
        <span className="mono-value" style={{ fontSize: 10, color: "var(--text-3)" }}>
          {timeAgo(n.at)}
        </span>
      </div>
    </>
  );

  const sharedClass = "flex items-start gap-4 px-5 py-3.5 transition-colors group hover:bg-white/[0.022] w-full text-left";

  if (n.href) {
    return (
      <Link href={n.href} className={sharedClass} style={baseStyle}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={sharedClass} style={baseStyle}>
      {inner}
    </div>
  );
}

export default function NotificationsPage() {
  const { items, unread, connected, markAllRead, reconnect } = useAdminNotifications(100);

  return (
    <div>
      {/* Page header */}
      <header className="page-header">
        <div className="flex items-center gap-3">
          <h1 className="page-title">
            <span className="page-title-prefix">/</span>
            Notifications
          </h1>

          {/* Live status */}
          <div className="flex items-center gap-1.5">
            {connected ? (
              <span className="badge badge-green flex items-center gap-1.5">
                <span className="live-dot" style={{ width: 5, height: 5 }} />
                LIVE
              </span>
            ) : (
              <span className="badge badge-red flex items-center gap-1.5">
                <BellOff className="w-3 h-3" />
                OFFLINE
              </span>
            )}
          </div>

          {/* Unread count */}
          {unread > 0 && (
            <span
              className="mono-value font-bold rounded-full"
              style={{
                fontSize: 10,
                padding: "2px 8px",
                background: "var(--signal-danger)",
                color: "#fff",
              }}
            >
              {unread} non lu{unread > 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!connected && (
            <button onClick={reconnect} className="btn-ghost btn-sm flex items-center gap-1.5">
              <WifiOff className="w-3.5 h-3.5" style={{ color: "var(--signal-danger)" }} />
              Reconnecter
            </button>
          )}
          {items.length > 0 && unread > 0 && (
            <button onClick={markAllRead} className="btn-ghost btn-sm flex items-center gap-1.5">
              <CheckCheck className="w-3.5 h-3.5" />
              Tout marquer lu
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="page-content">
        <div className="panel overflow-hidden" style={{ maxWidth: 720 }}>

          {/* Panel header */}
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}
          >
            <div className="flex items-center gap-2">
              <Bell className="w-3.5 h-3.5" style={{ color: "var(--xcore)", opacity: 0.7 }} />
              <span className="cmd-label">Stream en temps réel</span>
            </div>
            <span className="mono-value" style={{ fontSize: 10, color: "var(--text-3)" }}>
              {items.length} événement{items.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Notification list */}
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20" style={{ color: "var(--text-3)" }}>
              <Bell className="w-8 h-8 opacity-20" />
              <div className="text-center space-y-1">
                <p className="mono-value" style={{ fontSize: 12 }}>Aucune notification</p>
                <p className="mono-value" style={{ fontSize: 10 }}>
                  {connected
                    ? "En attente d'événements sur les canaux admin · broadcast"
                    : "Connexion SSE hors ligne — cliquez Reconnecter"}
                </p>
              </div>
              {!connected && (
                <button onClick={reconnect} className="btn-ghost btn-sm mt-2">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reconnecter
                </button>
              )}
            </div>
          ) : (
            <div>
              {items.map(n => <NotifRow key={n.id} n={n} />)}
            </div>
          )}
        </div>

        {/* Channel legend */}
        <div className="flex items-center gap-4 mt-4 px-1">
          {Object.entries(CHANNEL_META).map(([ch, m]) => (
            <div key={ch} className="flex items-center gap-1.5">
              <span className="rounded-full" style={{ width: 6, height: 6, background: m.color, display: "inline-block" }} />
              <span className="mono-value" style={{ fontSize: 10, color: "var(--text-3)" }}>{ch}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
