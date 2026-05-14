"use client";

import { useEffect, useState, useCallback } from "react";
import { pluginsApi, marketplaceApi, type PluginAdminOut, AdminApiError } from "@/lib/admin-api";
import {
  Search, RefreshCw, ChevronLeft, ChevronRight,
  Eye, EyeOff, Trash2, Scissors, Star, ExternalLink,
} from "lucide-react";
import Link from "next/link";

const PAGE_SIZE = 50;

function PluginRow({
  plugin,
  onUpdated,
  onDeleted,
}: {
  plugin: PluginAdminOut;
  onUpdated: (p: PluginAdminOut) => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy]         = useState(false);
  const [err, setErr]           = useState<string | null>(null);
  const [yankVer, setYankVer]   = useState("");
  const [showYank, setShowYank] = useState(false);

  async function togglePublish() {
    setBusy(true);
    setErr(null);
    try {
      await pluginsApi.togglePublish(plugin.slug, !plugin.is_published);
      onUpdated({ ...plugin, is_published: !plugin.is_published });
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Supprimer définitivement le plugin "${plugin.name}" ?`)) return;
    setBusy(true);
    setErr(null);
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
    setBusy(true);
    setErr(null);
    try {
      await marketplaceApi.yankVersion(plugin.slug, yankVer.trim());
      setShowYank(false);
      setYankVer("");
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const created = new Date(plugin.created_at).toLocaleDateString("fr-FR");

  return (
    <>
      <tr style={{ borderBottom: showYank ? "none" : "1px solid var(--border)" }}>
        {/* Published */}
        <td className="px-4 py-3">
          <span
            className="w-2 h-2 rounded-full inline-block"
            style={{ background: plugin.is_published ? "var(--signal-ok)" : "var(--text-3)" }}
          />
        </td>

        {/* Name / slug */}
        <td className="px-4 py-3">
          <Link href={`/plugins/${plugin.slug}`} className="group flex items-center gap-1.5">
            <div className="text-xs font-medium group-hover:underline" style={{ color: "var(--text-1)" }}>{plugin.name}</div>
            <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--xcore)" }} />
          </Link>
          <div className="text-[10px] mono-value mt-0.5" style={{ color: "var(--text-3)" }}>{`/${plugin.slug}`}</div>
        </td>

        {/* Developer */}
        <td className="px-4 py-3 text-xs" style={{ color: "var(--text-2)" }}>
          {plugin.developer_email ?? plugin.developer_id.slice(0, 8) + "…"}
        </td>

        {/* Rating */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 text-xs mono-value" style={{ color: "var(--text-2)" }}>
            <Star className="w-3 h-3" style={{ color: "var(--signal-warn)" }} />
            {plugin.avg_rating.toFixed(1)}
            <span style={{ color: "var(--text-3)" }}>({plugin.rating_count})</span>
          </div>
        </td>

        {/* Versions */}
        <td className="px-4 py-3 mono-value text-xs" style={{ color: "var(--text-2)" }}>
          {plugin.version_count}
        </td>

        {/* Created */}
        <td className="px-4 py-3 mono-value text-xs" style={{ color: "var(--text-3)" }}>
          {created}
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {err && <span className="text-[10px]" style={{ color: "var(--signal-danger)" }}>{err}</span>}

            <button
              onClick={togglePublish}
              disabled={busy}
              title={plugin.is_published ? "Dépublier" : "Publier"}
              className={plugin.is_published ? "btn-ghost btn-sm" : "btn-success btn-sm"}
              style={{ padding: "3px 8px" }}
            >
              {plugin.is_published ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {plugin.is_published ? "Dépublier" : "Publier"}
            </button>

            <button
              onClick={() => setShowYank(v => !v)}
              disabled={busy}
              title="Yank une version"
              className="btn-ghost btn-sm"
              style={{ padding: "3px 8px" }}
            >
              <Scissors className="w-3 h-3" />
            </button>

            <button
              onClick={handleDelete}
              disabled={busy}
              title="Supprimer le plugin"
              className="btn-ghost btn-sm"
              style={{ padding: "3px 8px", color: "var(--signal-danger)" }}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </td>
      </tr>

      {/* Yank inline form */}
      {showYank && (
        <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
          <td colSpan={7} className="px-4 py-3">
            <div className="flex items-center gap-2 text-xs">
              <span style={{ color: "var(--text-3)" }}>Yank version :</span>
              <input
                type="text"
                placeholder="ex: 1.2.3"
                value={yankVer}
                onChange={e => setYankVer(e.target.value)}
                className="input py-1 text-xs mono-value"
                style={{ width: 120 }}
              />
              <button onClick={handleYank} disabled={busy || !yankVer.trim()} className="btn-danger btn-sm" style={{ padding: "3px 10px" }}>
                Yank
              </button>
              <button onClick={() => setShowYank(false)} className="btn-ghost btn-sm" style={{ padding: "3px 8px" }}>
                Annuler
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function PluginsPage() {
  const [plugins, setPlugins]   = useState<PluginAdminOut[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [offset, setOffset]     = useState(0);
  const [search, setSearch]     = useState("");
  const [published, setPublished] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { search?: string; published?: boolean; limit: number; offset: number } = {
        limit: PAGE_SIZE,
        offset,
      };
      if (search)    params.search    = search;
      if (published) params.published = published === "true";
      const res = await pluginsApi.list(params);
      setPlugins(res.items);
      setTotal(res.total);
    } catch {
      setPlugins([]);
    } finally {
      setLoading(false);
    }
  }, [offset, search, published]);

  useEffect(() => { load(); }, [load]);

  const page       = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--text-1)" }}>
            Plugins
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-3)" }}>
            {total.toLocaleString("fr-FR")} plugins enregistrés
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
            placeholder="Rechercher par nom ou slug…"
            value={search}
            onChange={e => { setSearch(e.target.value); setOffset(0); }}
            className="input pl-8 py-2 text-xs"
          />
        </div>
        <select
          value={published}
          onChange={e => { setPublished(e.target.value); setOffset(0); }}
          className="input py-1.5 text-xs"
          style={{ width: "auto", minWidth: 130 }}
        >
          <option value="">Tous</option>
          <option value="true">Publiés</option>
          <option value="false">Non publiés</option>
        </select>
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["", "Plugin", "Développeur", "Note", "Versions", "Créé", "Actions"].map(h => (
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
                        <div className="skeleton h-4 rounded" style={{ width: j === 0 ? 16 : 90 }} />
                      </td>
                    ))}
                  </tr>
                ))
              : plugins.map(p => (
                  <PluginRow
                    key={p.id}
                    plugin={p}
                    onUpdated={updated => setPlugins(prev => prev.map(x => x.id === updated.id ? updated : x))}
                    onDeleted={id => setPlugins(prev => prev.filter(x => x.id !== id))}
                  />
                ))}
          </tbody>
        </table>
        {!loading && plugins.length === 0 && (
          <div className="py-16 text-center text-sm" style={{ color: "var(--text-3)" }}>
            Aucun plugin trouvé.
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
