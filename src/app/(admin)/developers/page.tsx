"use client";

import { useEffect, useState, useCallback } from "react";
import { marketplaceApi, type DeveloperOut, type PluginAdminOut, AdminApiError } from "@/lib/admin-api";
import {
  ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp,
  Star, Eye, EyeOff, Loader2, Code2, Search, Github, ExternalLink,
} from "lucide-react";
import Link from "next/link";

const PAGE_SIZE = 50;

const SCORE_AUTO_APPROVE = 20;
const SCORE_AUTO_REJECT  = 80;

function anomalyColor(score: number): string {
  if (score < SCORE_AUTO_APPROVE) return "var(--signal-ok)";
  if (score < SCORE_AUTO_REJECT)  return "var(--signal-warn)";
  return "var(--signal-danger)";
}

// ── Avatar initials ───────────────────────────────────────────────────────────

function avatarColor(email: string): string {
  // Deterministic hue from email string
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 28%, 22%)`;
}

function AvatarInitials({ email }: { email: string }) {
  const initials = email.slice(0, 2).toUpperCase();
  return (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: 4,
        background: avatarColor(email),
        border: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
        fontWeight: 700,
        color: "var(--text-2)",
        letterSpacing: "0.04em",
      }}
    >
      {initials}
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ published }: { published: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1"
      style={{
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 10,
        color: published ? "var(--signal-ok)" : "var(--text-3)",
        letterSpacing: "0.04em",
      }}
    >
      {published
        ? <><Eye style={{ width: 10, height: 10 }} /> published</>
        : <><EyeOff style={{ width: 10, height: 10 }} /> draft</>
      }
    </span>
  );
}

// ── Anomaly bar ───────────────────────────────────────────────────────────────

function AnomalyBar({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: "var(--text-3)" }}>
        —
      </span>
    );
  }
  const color = anomalyColor(score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div
        style={{
          width: 52,
          height: 3,
          background: "var(--surface-2)",
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${Math.min(100, score)}%`,
            height: "100%",
            background: color,
            borderRadius: 2,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <span
        style={{
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 10,
          color,
          minWidth: 20,
        }}
      >
        {score}
      </span>
    </div>
  );
}

// ── Plugin sub-panel ──────────────────────────────────────────────────────────

const SUB_COL_HEADS = ["name", "slug", "version", "rating", "status", "anomaly"];

function PluginsSubPanel({ plugins, loading, err }: {
  plugins: PluginAdminOut[] | null;
  loading: boolean;
  err: string | null;
}) {
  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--bg)",
        borderLeft: "2px solid var(--xcore-glow)",
      }}
    >
      {/* Sub-header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1.5fr 90px 80px 110px 120px",
          padding: "6px 20px 6px 16px",
          borderBottom: "1px solid var(--border)",
          background: "rgba(0,0,0,0.25)",
        }}
      >
        {SUB_COL_HEADS.map(h => (
          <span
            key={h}
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--text-3)",
              fontWeight: 600,
            }}
          >
            {h}
          </span>
        ))}
      </div>

      {/* States */}
      {loading && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "14px 16px",
            color: "var(--text-3)",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
          }}
        >
          <Loader2 style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />
          loading plugins…
        </div>
      )}

      {err && !loading && (
        <div
          style={{
            padding: "14px 16px",
            color: "var(--signal-danger)",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
          }}
        >
          {err}
        </div>
      )}

      {!loading && !err && plugins !== null && plugins.length === 0 && (
        <div
          style={{
            padding: "14px 16px",
            color: "var(--text-3)",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 11,
          }}
        >
          no plugins
        </div>
      )}

      {!loading && !err && plugins !== null && plugins.length > 0 && (
        <div>
          {plugins.map((p, idx) => {

            return (
              <div
                key={p.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1.5fr 90px 80px 110px 120px",
                  padding: "8px 20px 8px 16px",
                  borderBottom: idx < plugins.length - 1 ? "1px solid var(--border)" : "none",
                  alignItems: "center",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {/* Name */}
                <Link
                  href={`/plugins/${p.slug}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    color: "var(--text-1)",
                    fontSize: 11,
                    fontWeight: 500,
                    textDecoration: "none",
                  }}
                  className="group"
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </span>
                  <ExternalLink
                    style={{
                      width: 9,
                      height: 9,
                      color: "var(--xcore)",
                      opacity: 0,
                      flexShrink: 0,
                      transition: "opacity 0.15s",
                    }}
                    className="group-hover:opacity-70"
                  />
                </Link>

                {/* Slug */}
                <span
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 10,
                    color: "var(--text-3)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  /{p.slug}
                </span>

                {/* Version count */}
                <span
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 10,
                    color: p.version_count > 0 ? "var(--text-2)" : "var(--text-3)",
                  }}
                >
                  {p.version_count > 0 ? `${p.version_count}v` : "—"}
                </span>

                {/* Rating */}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 10,
                    color: "var(--text-2)",
                  }}
                >
                  <Star style={{ width: 9, height: 9, color: "var(--signal-warn)", flexShrink: 0 }} />
                  {p.avg_rating.toFixed(1)}
                  <span style={{ color: "var(--text-3)" }}>({p.rating_count})</span>
                </span>

                {/* Status */}
                <StatusBadge published={p.is_published} />

                {/* Anomaly */}
                <AnomalyBar score={null} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Developer row ─────────────────────────────────────────────────────────────

function DeveloperRow({ dev, index }: { dev: DeveloperOut; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [plugins,  setPlugins]  = useState<PluginAdminOut[] | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState<string | null>(null);

  async function handleExpand() {
    if (!expanded && plugins === null) {
      setLoading(true); setErr(null);
      try {
        setPlugins(await marketplaceApi.getDeveloperPlugins(dev.id));
      } catch (e) {
        setErr(e instanceof AdminApiError ? e.message : "Failed to load plugins");
      } finally { setLoading(false); }
    }
    setExpanded(v => !v);
  }

  const isExpandable = dev.plugin_count > 0;

  return (
    <div>
      {/* Main row */}
      <div
        className="group"
        style={{
          display: "grid",
          gridTemplateColumns: "44px 1fr 160px 100px 60px",
          alignItems: "center",
          borderBottom: expanded ? "none" : "1px solid var(--border)",
          padding: "0 8px",
          transition: "background 0.15s",
          cursor: isExpandable ? "pointer" : "default",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        onClick={isExpandable ? handleExpand : undefined}
      >
        {/* Index */}
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 10,
            color: "var(--text-3)",
            padding: "12px 0",
            userSelect: "none",
          }}
        >
          {String(index + 1).padStart(2, "0")}
        </div>

        {/* Developer: avatar + email + user ID */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", minWidth: 0 }}>
          <AvatarInitials email={dev.email} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-1)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {dev.email}
            </div>
            <div
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10,
                color: "var(--text-3)",
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {dev.id}
            </div>
          </div>
        </div>

        {/* GitHub */}
        <div style={{ padding: "12px 0" }}>
          {dev.github_login ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 8px",
                borderRadius: 4,
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10,
                color: "var(--text-2)",
              }}
            >
              <Github style={{ width: 10, height: 10, flexShrink: 0 }} />
              {dev.github_login}
            </span>
          ) : (
            <span
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 11,
                color: "var(--text-3)",
              }}
            >
              —
            </span>
          )}
        </div>

        {/* Plugin count badge */}
        <div style={{ padding: "12px 0" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 8px",
              borderRadius: 4,
              background: dev.plugin_count > 0 ? "var(--xcore-dim)" : "transparent",
              border: `1px solid ${dev.plugin_count > 0 ? "rgba(0,200,150,0.25)" : "var(--border)"}`,
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 10,
              color: dev.plugin_count > 0 ? "var(--xcore)" : "var(--text-3)",
              fontWeight: 600,
            }}
          >
            {dev.plugin_count}
          </span>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
          {isExpandable ? (
            <button
              onClick={e => { e.stopPropagation(); handleExpand(); }}
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 26,
                height: 26,
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: expanded ? "var(--xcore-dim)" : "var(--surface-2)",
                color: expanded ? "var(--xcore)" : "var(--text-3)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
              aria-label={expanded ? "Collapse" : "Expand plugins"}
            >
              {loading
                ? <Loader2 style={{ width: 11, height: 11, animation: "spin 1s linear infinite" }} />
                : expanded
                  ? <ChevronUp style={{ width: 11, height: 11 }} />
                  : <ChevronDown style={{ width: 11, height: 11 }} />
              }
            </button>
          ) : (
            <span
              style={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 10,
                color: "var(--text-3)",
              }}
            >
              —
            </span>
          )}
        </div>
      </div>

      {/* Expanded sub-panel */}
      {expanded && (
        <div style={{ borderBottom: "1px solid var(--border)", marginLeft: 44 }}>
          <PluginsSubPanel plugins={plugins} loading={loading} err={err} />
        </div>
      )}
    </div>
  );
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow({ index }: { index: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "44px 1fr 160px 100px 60px",
        alignItems: "center",
        borderBottom: "1px solid var(--border)",
        padding: "0 8px",
      }}
    >
      <div style={{ padding: "12px 0" }}>
        <div className="skeleton" style={{ width: 18, height: 10, borderRadius: 2, opacity: 0.4 + index * 0.05 }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0" }}>
        <div className="skeleton" style={{ width: 26, height: 26, borderRadius: 4, flexShrink: 0 }} />
        <div>
          <div className="skeleton" style={{ width: 160 + (index % 3) * 20, height: 11, borderRadius: 2 }} />
          <div className="skeleton" style={{ width: 200, height: 9, borderRadius: 2, marginTop: 4 }} />
        </div>
      </div>
      <div style={{ padding: "12px 0" }}>
        <div className="skeleton" style={{ width: 80, height: 22, borderRadius: 4 }} />
      </div>
      <div style={{ padding: "12px 0" }}>
        <div className="skeleton" style={{ width: 36, height: 22, borderRadius: 4 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
        <div className="skeleton" style={{ width: 26, height: 26, borderRadius: 4 }} />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const COL_HEADS: { label: string; width: string }[] = [
  { label: "#",          width: "44px" },
  { label: "developer",  width: "1fr" },
  { label: "github",     width: "160px" },
  { label: "plugins",    width: "100px" },
  { label: "actions",    width: "60px" },
];

export default function DevelopersPage() {
  const [devs,    setDevs]    = useState<DeveloperOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset,  setOffset]  = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [search,  setSearch]  = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await marketplaceApi.listDevelopers({ limit: PAGE_SIZE, offset });
      setDevs(result.items);
      setHasMore(result.has_more);
    } catch {
      setDevs([]);
      setHasMore(false);
    } finally { setLoading(false); }
  }, [offset]);

  useEffect(() => { load(); }, [load]);

  const page     = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPgs = hasMore ? page + 1 : page;
  const filtered = search
    ? devs.filter(d =>
        d.email.toLowerCase().includes(search.toLowerCase()) ||
        d.id.startsWith(search)
      )
    : devs;

  return (
    <div>

      {/* Page header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <h1 className="page-title">
            <span className="page-title-prefix">/</span>
            Developers
          </h1>
          {!loading && devs.length > 0 && (
            <span className="badge-gray mono-value" style={{ fontSize: 10 }}>
              {devs.length}
            </span>
          )}
        </div>

        <div className="relative">
          <Search className="absolute" style={{ left: 9, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: "var(--text-3)", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="filter by email or id…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input mono-value"
            style={{ width: 240, paddingLeft: 28, fontSize: 11 }}
          />
        </div>
      </div>

      <div className="page-content" style={{ maxWidth: 1100 }}>

      {/* Table container */}
      <div className="panel overflow-hidden">
        {/* Column headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: COL_HEADS.map(c => c.width).join(" "),
            padding: "0 8px",
            borderBottom: "1px solid var(--border)",
            background: "rgba(0,0,0,0.3)",
          }}
        >
          {COL_HEADS.map(col => (
            <div
              key={col.label}
              style={{
                padding: "9px 0",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 9,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--text-3)",
              }}
            >
              {col.label}
            </div>
          ))}
        </div>

        {/* Rows */}
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} index={i} />)
          : filtered.length > 0
            ? filtered.map((dev, i) => (
                <DeveloperRow key={dev.id} dev={dev} index={i} />
              ))
            : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: "60px 24px",
                }}
              >
                <Code2 style={{ width: 28, height: 28, color: "var(--text-3)", opacity: 0.4 }} />
                <span
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 11,
                    color: "var(--text-3)",
                  }}
                >
                  {search ? `no results for "${search}"` : "no developers found"}
                </span>
                {!search && (
                  <span
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 10,
                      color: "var(--text-3)",
                      opacity: 0.6,
                    }}
                  >
                    developers appear when they submit their first plugin
                  </span>
                )}
              </div>
            )
        }
      </div>

      {/* Pagination */}
      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-between mt-3">
          <span className="mono-value" style={{ fontSize: 10, color: "var(--text-3)" }}>
            pg {page}/{totalPgs}
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
              disabled={offset === 0 || loading}
              className="btn-outline btn-sm"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setOffset(o => o + PAGE_SIZE)}
              disabled={!hasMore || loading}
              className="btn-outline btn-sm"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      </div>{/* /page-content */}
    </div>
  );
}
