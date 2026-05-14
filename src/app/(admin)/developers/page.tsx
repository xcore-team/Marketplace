"use client";

import { useEffect, useState, useCallback } from "react";
import { marketplaceApi, type DeveloperOut, type PluginOut, AdminApiError } from "@/lib/admin-api";
import {
  RefreshCw, ChevronLeft, ChevronRight,
  ChevronDown, ChevronRight as ChevronRt,
  Star, Eye, EyeOff, Loader2, Code2, ExternalLink,
} from "lucide-react";
import Link from "next/link";

const PAGE_SIZE = 50;

// Pipeline thresholds — backend/pipelines/models.py
const SCORE_AUTO_APPROVE  = 20;
const SCORE_HIGH_PRIORITY = 50;
const SCORE_AUTO_REJECT   = 80;

function anomalyColor(score: number): string {
  if (score < SCORE_AUTO_APPROVE)  return "var(--signal-ok)";
  if (score < SCORE_HIGH_PRIORITY) return "var(--signal-warn)";
  if (score < SCORE_AUTO_REJECT)   return "#f97316";
  return "var(--signal-danger)";
}

function PluginsSubTable({ plugins }: { plugins: PluginOut[] }) {
  if (plugins.length === 0) {
    return (
      <div className="px-6 py-4 text-xs" style={{ color: "var(--text-3)" }}>
        Aucun plugin trouvé pour ce développeur.
      </div>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr style={{ borderBottom: "1px solid var(--border)" }}>
          {["", "Plugin", "Catégories", "Note", "Versions", "Score max", "Publié"].map(h => (
            <th
              key={h}
              className="px-4 py-2 text-left font-semibold"
              style={{ color: "var(--text-3)", background: "var(--surface-2)" }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {plugins.map(p => {
          const maxScore = p.versions.length > 0
            ? Math.max(...p.versions.map(v => v.anomaly_score))
            : null;
          const latestVersion = p.versions
            .slice()
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

          return (
            <tr
              key={p.id}
              style={{
                borderBottom: "1px solid var(--border)",
                background: "var(--surface-2)",
              }}
            >
              {/* Published dot */}
              <td className="px-4 py-2.5 w-6">
                <span
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{ background: p.is_published ? "var(--signal-ok)" : "var(--text-3)" }}
                />
              </td>

              {/* Name */}
              <td className="px-4 py-2.5">
                <Link
                  href={`/plugins/${p.slug}`}
                  className="group flex items-center gap-1.5"
                >
                  <span className="font-medium group-hover:underline" style={{ color: "var(--text-1)" }}>
                    {p.name}
                  </span>
                  <ExternalLink
                    className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--xcore)" }}
                  />
                </Link>
                <div className="mono-value text-[10px] mt-0.5" style={{ color: "var(--text-3)" }}>
                  /{p.slug}
                </div>
                {latestVersion && (
                  <div className="mono-value text-[10px]" style={{ color: "var(--text-3)" }}>
                    v{latestVersion.version}
                  </div>
                )}
              </td>

              {/* Categories */}
              <td className="px-4 py-2.5">
                <div className="flex flex-wrap gap-1">
                  {p.categories.length > 0
                    ? p.categories.map(c => (
                      <span
                        key={c.id}
                        className="px-1.5 py-0.5 rounded text-[9px]"
                        style={{ background: "var(--xcore-dim)", color: "var(--xcore)" }}
                      >
                        {c.name}
                      </span>
                    ))
                    : <span style={{ color: "var(--text-3)" }}>—</span>
                  }
                </div>
              </td>

              {/* Rating */}
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-1 mono-value" style={{ color: "var(--text-2)" }}>
                  <Star className="w-2.5 h-2.5" style={{ color: "var(--signal-warn)" }} />
                  {p.avg_rating.toFixed(1)}
                  <span style={{ color: "var(--text-3)" }}>({p.rating_count})</span>
                </div>
              </td>

              {/* Versions */}
              <td className="px-4 py-2.5 mono-value" style={{ color: "var(--text-2)" }}>
                {p.versions.length}
                {p.versions.filter(v => v.is_yanked).length > 0 && (
                  <span className="ml-1 text-[9px]" style={{ color: "var(--signal-danger)" }}>
                    ({p.versions.filter(v => v.is_yanked).length} yankée{p.versions.filter(v => v.is_yanked).length > 1 ? "s" : ""})
                  </span>
                )}
              </td>

              {/* Max anomaly score */}
              <td className="px-4 py-2.5">
                {maxScore !== null
                  ? (
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-12 h-1 rounded-full overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.08)" }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, maxScore)}%`,
                            background: anomalyColor(maxScore),
                          }}
                        />
                      </div>
                      <span className="mono-value text-[10px]" style={{ color: anomalyColor(maxScore) }}>
                        {maxScore}
                      </span>
                    </div>
                  )
                  : <span style={{ color: "var(--text-3)" }}>—</span>
                }
              </td>

              {/* Published */}
              <td className="px-4 py-2.5">
                <span
                  className="flex items-center gap-1 text-[10px] font-semibold"
                  style={{ color: p.is_published ? "var(--signal-ok)" : "var(--text-3)" }}
                >
                  {p.is_published
                    ? <><Eye className="w-3 h-3" /> Publié</>
                    : <><EyeOff className="w-3 h-3" /> Non publié</>
                  }
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DeveloperRow({ dev }: { dev: DeveloperOut }) {
  const [expanded, setExpanded] = useState(false);
  const [plugins,  setPlugins]  = useState<PluginOut[] | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [err,      setErr]      = useState<string | null>(null);

  async function handleExpand() {
    if (!expanded && plugins === null) {
      setLoading(true);
      setErr(null);
      try {
        const result = await marketplaceApi.getDeveloperPlugins(dev.id);
        setPlugins(result);
      } catch (e) {
        setErr(e instanceof AdminApiError ? e.message : "Impossible de charger les plugins");
      } finally {
        setLoading(false);
      }
    }
    setExpanded(v => !v);
  }

  return (
    <>
      <tr
        style={{ borderBottom: expanded ? "none" : "1px solid var(--border)" }}
        className="group"
      >
        {/* Expand toggle */}
        <td className="px-3 py-3 w-8">
          <button
            onClick={handleExpand}
            disabled={loading}
            className="flex items-center justify-center w-5 h-5 rounded transition-colors"
            style={{
              color: expanded ? "var(--xcore)" : "var(--text-3)",
              background: expanded ? "var(--xcore-dim)" : "transparent",
            }}
            aria-label={expanded ? "Replier" : "Voir les plugins"}
          >
            {loading
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : expanded
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRt className="w-3 h-3" />
            }
          </button>
        </td>

        {/* Email + ID */}
        <td className="px-4 py-3">
          <button
            onClick={handleExpand}
            className="text-left group/email"
            disabled={loading}
          >
            <div
              className="text-xs font-medium group-hover/email:underline"
              style={{ color: "var(--text-1)" }}
            >
              {dev.email}
            </div>
            <div className="mono-value text-[10px] mt-0.5" style={{ color: "var(--text-3)" }}>
              {dev.id.slice(0, 8)}…
            </div>
          </button>
        </td>

        {/* Plugin count */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              className="mono-value text-sm font-bold"
              style={{ color: dev.plugin_count > 0 ? "var(--text-1)" : "var(--text-3)" }}
            >
              {dev.plugin_count}
            </span>
            <span className="text-xs" style={{ color: "var(--text-3)" }}>
              plugin{dev.plugin_count > 1 ? "s" : ""}
            </span>
          </div>
        </td>

        {/* Quick action */}
        <td className="px-4 py-3">
          {err && (
            <span className="text-[10px]" style={{ color: "var(--signal-danger)" }}>{err}</span>
          )}
          <button
            onClick={handleExpand}
            disabled={loading || dev.plugin_count === 0}
            className="btn-ghost btn-sm opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ padding: "3px 10px", fontSize: 11 }}
          >
            {expanded ? "Replier" : "Voir plugins"}
          </button>
        </td>
      </tr>

      {/* Expanded sub-table */}
      {expanded && (
        <tr style={{ borderBottom: "1px solid var(--border)" }}>
          <td
            colSpan={4}
            style={{ padding: 0 }}
          >
            <div
              style={{
                borderLeft: "2px solid var(--xcore-glow)",
                marginLeft: 24,
              }}
            >
              {loading
                ? (
                  <div className="px-6 py-4 flex items-center gap-2 text-xs" style={{ color: "var(--text-3)" }}>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement des plugins…
                  </div>
                )
                : err
                  ? (
                    <div className="px-6 py-4 text-xs" style={{ color: "var(--signal-danger)" }}>
                      {err}
                    </div>
                  )
                  : plugins !== null
                    ? <PluginsSubTable plugins={plugins} />
                    : null
              }
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function DevelopersPage() {
  const [devs,    setDevs]    = useState<DeveloperOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset,  setOffset]  = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await marketplaceApi.listDevelopers({ limit: PAGE_SIZE, offset });
      setDevs(result);
      setHasMore(result.length === PAGE_SIZE);
    } catch {
      setDevs([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => { load(); }, [load]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="p-6 space-y-5 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--text-1)" }}>
            Développeurs
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-3)" }}>
            {devs.length > 0
              ? `${devs.length} développeur${devs.length > 1 ? "s" : ""} — cliquez pour voir leurs plugins`
              : "Développeurs ayant au moins un plugin publié"
            }
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Table */}
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="w-8" />
              {["Développeur", "Plugins", ""].map(h => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-xs font-semibold"
                  style={{ color: "var(--text-3)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td className="px-3 py-3 w-8">
                      <div className="skeleton w-5 h-5 rounded" />
                    </td>
                    {[140, 60, 80].map((w, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="skeleton h-4 rounded" style={{ width: w }} />
                        {j === 0 && <div className="skeleton h-3 rounded mt-1.5" style={{ width: 60 }} />}
                      </td>
                    ))}
                  </tr>
                ))
              : devs.map(dev => (
                  <DeveloperRow key={dev.id} dev={dev} />
                ))
            }
          </tbody>
        </table>

        {!loading && devs.length === 0 && (
          <div className="py-16 flex flex-col items-center gap-3">
            <Code2 className="w-8 h-8" style={{ color: "var(--text-3)" }} />
            <p className="text-sm" style={{ color: "var(--text-3)" }}>
              Aucun développeur trouvé.
            </p>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              Les développeurs apparaissent ici dès qu'ils publient leur premier plugin.
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--text-3)" }}>
            Page {page}
          </span>
          <div className="flex gap-2">
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

    </div>
  );
}
