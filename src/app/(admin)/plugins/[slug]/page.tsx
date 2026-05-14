"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  marketplaceApi, categoriesApi,
  type PluginOut, type PluginVersionOut, type CategoryAdminOut,
  AdminApiError,
} from "@/lib/admin-api";
import {
  ArrowLeft, RefreshCw, Eye, EyeOff, Scissors, ExternalLink,
  CheckCircle2, XCircle, Clock, AlertTriangle, Loader2,
  GitBranch, Globe, Star,
} from "lucide-react";
import Link from "next/link";

// Pipeline thresholds — see backend/pipelines/models.py
const SCORE_AUTO_APPROVE  = 20;
const SCORE_HIGH_PRIORITY = 50;
const SCORE_AUTO_REJECT   = 80;

function anomalyColor(score: number): string {
  if (score < SCORE_AUTO_APPROVE)  return "var(--signal-ok)";
  if (score < SCORE_HIGH_PRIORITY) return "var(--signal-warn)";
  if (score < SCORE_AUTO_REJECT)   return "#f97316";
  return "var(--signal-danger)";
}

function anomalyLabel(score: number): string {
  if (score < SCORE_AUTO_APPROVE)  return "Clean";
  if (score < SCORE_HIGH_PRIORITY) return "Review";
  if (score < SCORE_AUTO_REJECT)   return "High";
  return "Reject";
}

function AnomalyBar({ score }: { score: number }) {
  const color = anomalyColor(score);
  const pct   = Math.min(100, score);
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="mono-value text-[10px]" style={{ color }}>{score}</span>
      <span className="text-[10px]" style={{ color: "var(--text-3)" }}>{anomalyLabel(score)}</span>
    </div>
  );
}

function PublishStatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string; label: string }> = {
    approved:      { color: "var(--signal-ok)",      bg: "rgba(0,200,150,0.1)",  label: "Approved" },
    rejected:      { color: "var(--signal-danger)",  bg: "rgba(239,68,68,0.1)",  label: "Rejected" },
    pending:       { color: "var(--signal-pending)", bg: "rgba(56,189,248,0.1)", label: "Pending" },
    processing:    { color: "var(--signal-pending)", bg: "rgba(56,189,248,0.1)", label: "Processing" },
    manual_review: { color: "var(--signal-warn)",    bg: "rgba(245,158,11,0.1)", label: "Manual Review" },
  };
  const style = map[status] ?? { color: "var(--text-3)", bg: "rgba(148,163,184,0.08)", label: status };
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
      style={{ color: style.color, background: style.bg }}
    >
      {style.label}
    </span>
  );
}

function VersionRow({
  version,
  pluginSlug,
  onYanked,
}: {
  version: PluginVersionOut;
  pluginSlug: string;
  onYanked: (id: string) => void;
}) {
  const [showYank, setShowYank] = useState(false);
  const [reason,   setReason]   = useState("");
  const [busy,     setBusy]     = useState(false);
  const [err,      setErr]      = useState<string | null>(null);

  async function handleYank() {
    setBusy(true);
    setErr(null);
    try {
      await marketplaceApi.yankVersion(pluginSlug, version.version, reason.trim() || undefined);
      onYanked(version.id);
      setShowYank(false);
      setReason("");
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const created = new Date(version.created_at).toLocaleDateString("fr-FR");

  return (
    <>
      <tr
        style={{
          borderBottom: showYank ? "none" : "1px solid var(--border)",
          opacity: version.is_yanked ? 0.5 : 1,
        }}
      >
        {/* Version */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="mono-value text-xs font-semibold" style={{ color: "var(--text-1)" }}>
              {version.version}
            </span>
            {version.is_stable && (
              <span
                className="px-1 py-0.5 rounded text-[9px] font-bold uppercase"
                style={{ background: "var(--xcore-dim)", color: "var(--xcore)" }}
              >
                stable
              </span>
            )}
            {version.is_yanked && (
              <span
                className="px-1 py-0.5 rounded text-[9px] font-bold uppercase"
                style={{ background: "rgba(239,68,68,0.1)", color: "var(--signal-danger)" }}
              >
                yanked
              </span>
            )}
          </div>
          {version.yanked_reason && (
            <div className="text-[10px] mt-0.5 truncate max-w-[180px]" style={{ color: "var(--signal-danger)" }}>
              {version.yanked_reason}
            </div>
          )}
        </td>

        {/* Status */}
        <td className="px-4 py-3">
          <PublishStatusBadge status={version.publish_status} />
        </td>

        {/* Anomaly */}
        <td className="px-4 py-3">
          <AnomalyBar score={version.anomaly_score} />
        </td>

        {/* Changelog */}
        <td className="px-4 py-3 max-w-[200px]">
          {version.changelog
            ? <span className="text-[11px] line-clamp-2" style={{ color: "var(--text-2)" }}>{version.changelog}</span>
            : <span className="text-[11px]" style={{ color: "var(--text-3)" }}>—</span>}
        </td>

        {/* Merkle */}
        <td className="px-4 py-3">
          {version.merkle_root
            ? <span className="mono-value text-[10px]" style={{ color: "var(--text-3)" }}>{version.merkle_root.slice(0, 12)}…</span>
            : <span style={{ color: "var(--text-3)" }}>—</span>}
        </td>

        {/* Date */}
        <td className="px-4 py-3 mono-value text-[11px]" style={{ color: "var(--text-3)" }}>
          {created}
        </td>

        {/* Actions */}
        <td className="px-4 py-3">
          {!version.is_yanked && (
            <button
              onClick={() => setShowYank(v => !v)}
              disabled={busy}
              className="btn-ghost btn-sm"
              style={{ padding: "3px 8px" }}
              title="Retirer cette version"
            >
              <Scissors className="w-3 h-3" />
              Yank
            </button>
          )}
        </td>
      </tr>

      {showYank && (
        <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
          <td colSpan={7} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span style={{ color: "var(--text-3)" }}>Raison (optionnel) :</span>
              <input
                type="text"
                placeholder="ex: faille de sécurité…"
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="input py-1 text-xs flex-1 min-w-40"
                style={{ maxWidth: 300 }}
              />
              {err && <span className="text-[10px]" style={{ color: "var(--signal-danger)" }}>{err}</span>}
              <button
                onClick={handleYank}
                disabled={busy}
                className="btn-danger btn-sm"
                style={{ padding: "3px 10px" }}
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Scissors className="w-3 h-3" />}
                Confirmer le yank
              </button>
              <button
                onClick={() => { setShowYank(false); setReason(""); setErr(null); }}
                className="btn-ghost btn-sm"
                style={{ padding: "3px 8px" }}
              >
                Annuler
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function PluginDetailPage() {
  const { slug }  = useParams<{ slug: string }>();
  const router    = useRouter();

  const [plugin,      setPlugin]      = useState<PluginOut | null>(null);
  const [allCats,     setAllCats]     = useState<CategoryAdminOut[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState<string | null>(null);

  // Edit state
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft,   setDescDraft]   = useState("");
  const [editingCats, setEditingCats] = useState(false);
  const [catDraft,    setCatDraft]    = useState<string[]>([]);
  const [saving,      setSaving]      = useState(false);
  const [saveErr,     setSaveErr]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [p, cats] = await Promise.all([
        marketplaceApi.getPlugin(slug),
        categoriesApi.list(),
      ]);
      setPlugin(p);
      setAllCats(cats);
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Impossible de charger le plugin");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  async function togglePublish() {
    if (!plugin) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const updated = await marketplaceApi.updatePlugin(slug, { is_published: !plugin.is_published });
      setPlugin(updated);
    } catch (e) {
      setSaveErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function saveDescription() {
    if (!plugin) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const updated = await marketplaceApi.updatePlugin(slug, { description: descDraft });
      setPlugin(updated);
      setEditingDesc(false);
    } catch (e) {
      setSaveErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function saveCategories() {
    if (!plugin) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const updated = await marketplaceApi.updatePlugin(slug, { category_ids: catDraft });
      setPlugin(updated);
      setEditingCats(false);
    } catch (e) {
      setSaveErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  function startEditDesc() {
    setDescDraft(plugin?.description ?? "");
    setEditingDesc(true);
  }

  function startEditCats() {
    setCatDraft(plugin?.categories.map(c => c.id) ?? []);
    setEditingCats(true);
  }

  function toggleCat(id: string) {
    setCatDraft(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  const sortedVersions = plugin
    ? [...plugin.versions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    : [];

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-3" style={{ color: "var(--text-3)" }}>
        <Loader2 className="w-4 h-4 animate-spin" />
        Chargement…
      </div>
    );
  }

  if (err || !plugin) {
    return (
      <div className="p-6 space-y-4">
        <button onClick={() => router.back()} className="btn-ghost btn-sm flex items-center gap-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Retour
        </button>
        <div className="alert-danger flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4" />
          {err ?? "Plugin introuvable"}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl">

      {/* Breadcrumb / header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/plugins" className="btn-ghost btn-sm flex items-center gap-1.5">
            <ArrowLeft className="w-3.5 h-3.5" />
            Plugins
          </Link>
          <span style={{ color: "var(--text-3)" }}>/</span>
          <span className="font-display text-xl font-bold" style={{ color: "var(--text-1)" }}>
            {plugin.name}
          </span>
          <span className="mono-value text-xs px-2 py-0.5 rounded" style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>
            /{plugin.slug}
          </span>
          {plugin.is_published
            ? <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded font-semibold" style={{ background: "rgba(0,200,150,0.1)", color: "var(--signal-ok)" }}>
                <CheckCircle2 className="w-3 h-3" /> Publié
              </span>
            : <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded font-semibold" style={{ background: "rgba(148,163,184,0.08)", color: "var(--text-3)" }}>
                <XCircle className="w-3 h-3" /> Non publié
              </span>
          }
        </div>
        <div className="flex items-center gap-2">
          {saveErr && <span className="text-xs" style={{ color: "var(--signal-danger)" }}>{saveErr}</span>}
          <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={togglePublish}
            disabled={saving}
            className={plugin.is_published ? "btn-ghost btn-sm" : "btn-success btn-sm"}
            style={{ padding: "5px 12px" }}
          >
            {saving
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : plugin.is_published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {plugin.is_published ? "Dépublier" : "Publier"}
          </button>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 gap-4" style={{ gridTemplateColumns: "1fr 320px" }}>

        {/* Left column */}
        <div className="space-y-4">

          {/* Metadata card */}
          <div className="panel p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold" style={{ color: "var(--text-1)" }}>
                Informations
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-xs">
              <div>
                <div className="mb-0.5" style={{ color: "var(--text-3)" }}>ID</div>
                <div className="mono-value" style={{ color: "var(--text-2)" }}>{plugin.id}</div>
              </div>
              <div>
                <div className="mb-0.5" style={{ color: "var(--text-3)" }}>Developer ID</div>
                <div className="mono-value" style={{ color: "var(--text-2)" }}>{plugin.developer_id}</div>
              </div>
              <div>
                <div className="mb-0.5" style={{ color: "var(--text-3)" }}>Note moyenne</div>
                <div className="flex items-center gap-1 mono-value" style={{ color: "var(--text-2)" }}>
                  <Star className="w-3 h-3" style={{ color: "var(--signal-warn)" }} />
                  {plugin.avg_rating.toFixed(1)} <span style={{ color: "var(--text-3)" }}>({plugin.rating_count})</span>
                </div>
              </div>
              <div>
                <div className="mb-0.5" style={{ color: "var(--text-3)" }}>Créé le</div>
                <div className="mono-value" style={{ color: "var(--text-2)" }}>
                  {new Date(plugin.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
                </div>
              </div>
              {plugin.homepage && (
                <div>
                  <div className="mb-0.5" style={{ color: "var(--text-3)" }}>Homepage</div>
                  <a href={plugin.homepage} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1" style={{ color: "var(--xcore)" }}>
                    <Globe className="w-3 h-3" /> {plugin.homepage}
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              )}
              {plugin.repository && (
                <div>
                  <div className="mb-0.5" style={{ color: "var(--text-3)" }}>Repository</div>
                  <a href={plugin.repository} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1" style={{ color: "var(--xcore)" }}>
                    <GitBranch className="w-3 h-3" /> {plugin.repository}
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs" style={{ color: "var(--text-3)" }}>Description</span>
                {!editingDesc && (
                  <button
                    onClick={startEditDesc}
                    className="text-[10px]"
                    style={{ color: "var(--xcore)" }}
                  >
                    Modifier
                  </button>
                )}
              </div>
              {editingDesc ? (
                <div className="space-y-2">
                  <textarea
                    value={descDraft}
                    onChange={e => setDescDraft(e.target.value)}
                    rows={4}
                    className="input text-xs w-full resize-none"
                    placeholder="Description du plugin…"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveDescription}
                      disabled={saving}
                      className="btn-primary btn-sm"
                      style={{ padding: "4px 12px" }}
                    >
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Enregistrer"}
                    </button>
                    <button
                      onClick={() => setEditingDesc(false)}
                      className="btn-ghost btn-sm"
                      style={{ padding: "4px 10px" }}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs" style={{ color: plugin.description ? "var(--text-2)" : "var(--text-3)" }}>
                  {plugin.description ?? "Aucune description."}
                </p>
              )}
            </div>
          </div>

          {/* Versions table */}
          <div className="panel overflow-hidden">
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
              <h2 className="font-display text-sm font-semibold" style={{ color: "var(--text-1)" }}>
                Versions
                <span className="ml-2 mono-value text-xs" style={{ color: "var(--text-3)" }}>
                  {plugin.versions.length}
                </span>
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Version", "Statut", "Score anomalie", "Changelog", "Merkle", "Date", ""].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold" style={{ color: "var(--text-3)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedVersions.length === 0
                  ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm" style={{ color: "var(--text-3)" }}>
                        Aucune version.
                      </td>
                    </tr>
                  )
                  : sortedVersions.map(v => (
                    <VersionRow
                      key={v.id}
                      version={v}
                      pluginSlug={plugin.slug}
                      onYanked={id =>
                        setPlugin(prev => prev
                          ? { ...prev, versions: prev.versions.map(x => x.id === id ? { ...x, is_yanked: true } : x) }
                          : prev
                        )
                      }
                    />
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">

          {/* Stats mini-card */}
          <div className="panel p-4 space-y-3">
            <h2 className="font-display text-sm font-semibold" style={{ color: "var(--text-1)" }}>
              Statistiques
            </h2>
            <div className="space-y-2 text-xs">
              {[
                { label: "Versions totales",    value: plugin.versions.length },
                { label: "Versions stables",    value: plugin.versions.filter(v => v.is_stable && !v.is_yanked).length },
                { label: "Versions yankées",    value: plugin.versions.filter(v => v.is_yanked).length },
                { label: "Score max anomalie",  value: plugin.versions.length > 0 ? Math.max(...plugin.versions.map(v => v.anomaly_score)) : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between">
                  <span style={{ color: "var(--text-3)" }}>{label}</span>
                  <span className="mono-value font-semibold" style={{ color: "var(--text-1)" }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Categories card */}
          <div className="panel p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold" style={{ color: "var(--text-1)" }}>
                Catégories
              </h2>
              {!editingCats && (
                <button
                  onClick={startEditCats}
                  className="text-[10px]"
                  style={{ color: "var(--xcore)" }}
                >
                  Modifier
                </button>
              )}
            </div>

            {editingCats ? (
              <div className="space-y-2">
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {allCats.map(cat => (
                    <label
                      key={cat.id}
                      className="flex items-center gap-2 cursor-pointer text-xs"
                      style={{ color: "var(--text-2)" }}
                    >
                      <input
                        type="checkbox"
                        checked={catDraft.includes(cat.id)}
                        onChange={() => toggleCat(cat.id)}
                        className="rounded"
                        style={{ accentColor: "var(--xcore)" }}
                      />
                      {cat.name}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={saveCategories}
                    disabled={saving}
                    className="btn-primary btn-sm"
                    style={{ padding: "4px 12px" }}
                  >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Enregistrer"}
                  </button>
                  <button
                    onClick={() => setEditingCats(false)}
                    className="btn-ghost btn-sm"
                    style={{ padding: "4px 10px" }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {plugin.categories.length > 0
                  ? plugin.categories.map(cat => (
                    <span
                      key={cat.id}
                      className="px-2 py-0.5 rounded text-[11px]"
                      style={{ background: "var(--xcore-dim)", color: "var(--xcore)" }}
                    >
                      {cat.name}
                    </span>
                  ))
                  : <span className="text-xs" style={{ color: "var(--text-3)" }}>Aucune catégorie assignée.</span>
                }
              </div>
            )}
          </div>

          {/* Publish status timeline */}
          <div className="panel p-4 space-y-3">
            <h2 className="font-display text-sm font-semibold" style={{ color: "var(--text-1)" }}>
              Statuts des versions
            </h2>
            <div className="space-y-1.5">
              {sortedVersions.slice(0, 8).map(v => (
                <div key={v.id} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="mono-value" style={{ color: "var(--text-2)" }}>{v.version}</span>
                  <div className="flex items-center gap-1.5">
                    <AnomalyBar score={v.anomaly_score} />
                  </div>
                </div>
              ))}
              {sortedVersions.length > 8 && (
                <div className="text-[10px]" style={{ color: "var(--text-3)" }}>
                  +{sortedVersions.length - 8} autres versions…
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
