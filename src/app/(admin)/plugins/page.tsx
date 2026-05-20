"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { pluginsApi, marketplaceApi, type PluginAdminOut, AdminApiError } from "@/lib/admin-api";
import {
  Search, RefreshCw, ChevronLeft, ChevronRight,
  Eye, EyeOff, Trash2, Scissors,
} from "lucide-react";

const PAGE_SIZE = 50;

// ── Plugin row ────────────────────────────────────────────────────────────────

function PluginRow({
  plugin,
  onUpdated,
  onDeleted,
}: {
  plugin: PluginAdminOut;
  onUpdated: (p: PluginAdminOut) => void;
  onDeleted: (id: string) => void;
}) {
  const [busy,       setBusy]       = useState(false);
  const [err,        setErr]        = useState<string | null>(null);
  const [showYank,   setShowYank]   = useState(false);
  const [yankVer,    setYankVer]    = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  async function togglePublish() {
    setBusy(true); setErr(null);
    try {
      await pluginsApi.togglePublish(plugin.slug, !plugin.is_published);
      onUpdated({ ...plugin, is_published: !plugin.is_published });
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally { setBusy(false); }
  }

  async function handleDelete() {
    setBusy(true); setErr(null);
    try {
      await pluginsApi.delete(plugin.slug);
      onDeleted(plugin.id);
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur");
      setBusy(false);
    }
  }

  async function handleYank() {
    if (!yankVer.trim()) return;
    setBusy(true); setErr(null);
    try {
      await marketplaceApi.yankVersion(plugin.slug, yankVer.trim());
      setShowYank(false);
      setYankVer("");
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally { setBusy(false); }
  }

  const published = new Date(plugin.created_at).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "short", year: "2-digit",
  });

  // Star rating display — filled vs empty
  const fullStars  = Math.round(plugin.avg_rating);
  const stars      = Array.from({ length: 5 }, (_, i) => i < fullStars);

  return (
    <>
      <div
        className="data-row group animate-enter"
        style={{
          borderLeft: `2px solid ${plugin.is_published ? "var(--signal-ok)" : "var(--border)"}`,
          paddingLeft: "calc(1rem - 2px)",
        }}
      >
        {/* Name + slug */}
        <div className="flex-1 min-w-0">
          <Link
            href={`/plugins/${plugin.slug}`}
            className="block font-medium text-sm leading-tight hover:text-[var(--xcore)] transition-colors"
            style={{ color: "var(--text-1)" }}
          >
            {plugin.name}
          </Link>
          <span className="mono-value" style={{ fontSize: 10, color: "var(--text-3)" }}>
            /{plugin.slug}
          </span>
        </div>

        {/* Developer */}
        <div className="w-44 flex-shrink-0 truncate text-xs" style={{ color: "var(--text-2)" }}>
          {plugin.developer_email ?? `${plugin.developer_id.slice(0, 10)}…`}
        </div>

        {/* Rating */}
        <div className="w-28 flex-shrink-0 flex items-center gap-1.5">
          <span style={{ color: "var(--signal-warn)", fontSize: 11, letterSpacing: "-1px", lineHeight: 1 }}>
            {stars.map((filled, i) => (
              <span key={i} style={{ opacity: filled ? 1 : 0.25 }}>★</span>
            ))}
          </span>
          <span className="mono-value text-xs" style={{ color: "var(--text-2)" }}>
            {plugin.avg_rating.toFixed(1)}
          </span>
          <span className="mono-value" style={{ fontSize: 10, color: "var(--text-3)" }}>
            ({plugin.rating_count})
          </span>
        </div>

        {/* Versions */}
        <div className="w-20 flex-shrink-0 flex justify-center">
          <span className="badge-gray mono-value" style={{ fontSize: 10 }}>
            {plugin.version_count}v
          </span>
        </div>

        {/* Published date */}
        <div className="w-20 flex-shrink-0">
          <span className="mono-value" style={{ fontSize: 10, color: "var(--text-3)" }}>
            {published}
          </span>
        </div>

        {/* Status */}
        <div className="w-16 flex-shrink-0 flex justify-center">
          {plugin.is_published
            ? <span className="badge-green mono-value" style={{ fontSize: 10 }}>Live</span>
            : <span className="badge-gray mono-value"  style={{ fontSize: 10 }}>Draft</span>
          }
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {err && (
            <span className="mono-value mr-1" style={{ fontSize: 10, color: "var(--signal-danger)" }}>
              {err}
            </span>
          )}

          {/* Toggle publish */}
          <button
            onClick={togglePublish}
            disabled={busy}
            title={plugin.is_published ? "Dépublier" : "Publier"}
            className="btn-ghost btn-xs"
            style={{ color: plugin.is_published ? "var(--text-3)" : "var(--signal-ok)" }}
          >
            {plugin.is_published ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>

          {/* Yank toggle */}
          <button
            onClick={() => { setShowYank(v => !v); setConfirmDel(false); }}
            disabled={busy}
            title="Yank une version"
            className="btn-ghost btn-xs"
            style={{ color: showYank ? "var(--signal-warn)" : undefined }}
          >
            <Scissors className="w-3 h-3" />
          </button>

          {/* Delete — two-step */}
          {confirmDel ? (
            <span className="flex items-center gap-1">
              <span className="mono-value" style={{ fontSize: 10, color: "var(--signal-danger)" }}>rm?</span>
              <button onClick={handleDelete} disabled={busy} className="btn-danger btn-xs">Y</button>
              <button onClick={() => setConfirmDel(false)} className="btn-ghost btn-xs">N</button>
            </span>
          ) : (
            <button
              onClick={() => { setConfirmDel(true); setShowYank(false); }}
              disabled={busy}
              title="Supprimer le plugin"
              className="btn-ghost btn-xs"
              style={{ color: "var(--signal-danger)" }}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Yank inline panel */}
      {showYank && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 animate-enter"
          style={{
            borderBottom: "1px solid var(--border)",
            borderLeft: "2px solid var(--signal-warn)",
            paddingLeft: "calc(1rem - 2px)",
            background: "color-mix(in srgb, var(--signal-warn) 4%, var(--surface))",
          }}
        >
          <Scissors className="w-3 h-3 flex-shrink-0" style={{ color: "var(--signal-warn)" }} />
          <span className="cmd-label" style={{ color: "var(--text-3)" }}>yank</span>
          <span className="mono-value text-xs" style={{ color: "var(--text-2)" }}>{plugin.slug}</span>
          <span style={{ color: "var(--text-3)", fontSize: 12 }}>@</span>
          <input
            type="text"
            placeholder="1.2.3"
            value={yankVer}
            onChange={e => setYankVer(e.target.value)}
            className="input mono-value py-1 text-xs"
            style={{ width: 96 }}
            autoFocus
            onKeyDown={e => {
              if (e.key === "Enter")  handleYank();
              if (e.key === "Escape") setShowYank(false);
            }}
          />
          <button
            onClick={handleYank}
            disabled={busy || !yankVer.trim()}
            className="btn-warn btn-xs"
          >
            Confirm
          </button>
          <button onClick={() => setShowYank(false)} className="btn-ghost btn-xs">
            Esc
          </button>
        </div>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PluginsPage() {
  const [plugins,   setPlugins]   = useState<PluginAdminOut[]>([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [offset,    setOffset]    = useState(0);
  const [search,    setSearch]    = useState("");
  const [published, setPublished] = useState<"" | "true" | "false">("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { search?: string; published?: boolean; limit: number; offset: number } = {
        limit: PAGE_SIZE, offset,
      };
      if (search)    params.search    = search;
      if (published) params.published = published === "true";
      const res = await pluginsApi.list(params);
      setPlugins(res.items);
      setTotal(res.total);
    } catch {
      setPlugins([]);
    } finally { setLoading(false); }
  }, [offset, search, published]);

  useEffect(() => { load(); }, [load]);

  const page       = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const publishedCount   = plugins.filter(p => p.is_published).length;
  const unpublishedCount = plugins.filter(p => !p.is_published).length;

  return (
    <div>

      {/* Sticky header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <h1 className="page-title">Plugins</h1>
          {!loading && (
            <span className="badge-gray mono-value" style={{ fontSize: 10 }}>
              {total}
            </span>
          )}
        </div>

        <div className="filter-bar">
          {/* Status filter chips */}
          <button
            onClick={() => { setPublished(""); setOffset(0); }}
            className={`filter-chip${published === "" ? " active" : ""}`}
          >
            All
          </button>
          <button
            onClick={() => { setPublished("true"); setOffset(0); }}
            className={`filter-chip${published === "true" ? " active" : ""}`}
          >
            Live
            {!loading && (
              <span className="mono-value ml-1" style={{ fontSize: 10 }}>
                {publishedCount}
              </span>
            )}
          </button>
          <button
            onClick={() => { setPublished("false"); setOffset(0); }}
            className={`filter-chip${published === "false" ? " active" : ""}`}
          >
            Draft
            {!loading && (
              <span className="mono-value ml-1" style={{ fontSize: 10 }}>
                {unpublishedCount}
              </span>
            )}
          </button>

          {/* Search */}
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"
              style={{ color: "var(--text-3)" }}
            />
            <input
              type="text"
              placeholder="name, slug…"
              value={search}
              onChange={e => { setSearch(e.target.value); setOffset(0); }}
              className="input mono-value pl-7 py-1.5 text-xs"
              style={{ width: 220 }}
            />
          </div>

          {/* Refresh */}
          <button onClick={load} disabled={loading} className="btn-ghost btn-sm" title="Rafraîchir">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="page-content">
      <div className="panel overflow-hidden">
        {/* Column headers */}
        <div className="data-table">
          <div
            className="flex items-center gap-0 px-4 py-2"
            style={{
              borderBottom: "1px solid var(--border)",
              borderLeft: "2px solid transparent",
              paddingLeft: "calc(1rem - 2px)",
            }}
          >
            <div className="col-head flex-1">Name / Slug</div>
            <div className="col-head w-44">Developer</div>
            <div className="col-head w-28">Rating</div>
            <div className="col-head w-20 text-center">Versions</div>
            <div className="col-head w-20">Published</div>
            <div className="col-head w-16 text-center">Status</div>
            <div className="col-head" style={{ width: 120, textAlign: "right" }}>Actions</div>
          </div>

          {/* Skeleton rows */}
          {loading && Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-4 py-3"
              style={{
                borderBottom: "1px solid var(--border)",
                borderLeft: "2px solid var(--border)",
                paddingLeft: "calc(1rem - 2px)",
              }}
            >
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3 rounded w-32" />
                <div className="skeleton h-2.5 rounded w-20" />
              </div>
              <div className="skeleton h-2.5 rounded w-36" />
              <div className="skeleton h-2.5 rounded w-20" />
              <div className="skeleton h-5 rounded w-10 mx-auto" />
              <div className="skeleton h-2.5 rounded w-16" />
              <div className="skeleton h-5 rounded w-12 mx-auto" />
              <div className="skeleton h-5 rounded w-20 ml-auto" />
            </div>
          ))}

          {/* Plugin rows */}
          {!loading && plugins.map((p, i) => (
            <PluginRow
              key={p.id}
              plugin={p}
              onUpdated={updated => setPlugins(prev => prev.map(x => x.id === updated.id ? updated : x))}
              onDeleted={id => setPlugins(prev => prev.filter(x => x.id !== id))}
            />
          ))}

          {/* Empty state */}
          {!loading && plugins.length === 0 && (
            <div
              className="py-16 text-center mono-value text-xs"
              style={{ color: "var(--text-3)" }}
            >
              — no plugins found —
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3">
          <span className="mono-value" style={{ fontSize: 11, color: "var(--text-3)" }}>
            pg {page}/{totalPages}
            <span style={{ marginLeft: 8, color: "var(--text-3)" }}>·</span>
            <span style={{ marginLeft: 8 }}>{total} total</span>
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
              disabled={offset === 0}
              className="btn-outline btn-sm"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setOffset(o => o + PAGE_SIZE)}
              disabled={page >= totalPages}
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
