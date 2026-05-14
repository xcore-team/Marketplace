"use client";

import { useEffect, useState } from "react";
import { categoriesApi, type CategoryAdminOut, AdminApiError } from "@/lib/admin-api";
import { Plus, Pencil, Trash2, RefreshCw, Check, X } from "lucide-react";

function CategoryRow({
  cat,
  onUpdated,
  onDeleted,
}: {
  cat: CategoryAdminOut;
  onUpdated: (c: CategoryAdminOut) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing]     = useState(false);
  const [name, setName]           = useState(cat.name);
  const [description, setDesc]    = useState(cat.description ?? "");
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await categoriesApi.update(cat.id, {
        name: name.trim() || undefined,
        description: description.trim() || undefined,
      });
      // Merge local state with existing cat to preserve slug & plugin_count
      // (backend PATCH returns only updated fields, not the full object)
      onUpdated({
        ...cat,
        name:        name.trim()        || cat.name,
        description: description.trim() || null,
      });
      setEditing(false);
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Supprimer la catégorie "${cat.name}" ?`)) return;
    setBusy(true);
    setErr(null);
    try {
      await categoriesApi.delete(cat.id);
      onDeleted(cat.id);
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur");
      setBusy(false);
    }
  }

  function cancel() {
    setName(cat.name);
    setDesc(cat.description ?? "");
    setEditing(false);
    setErr(null);
  }

  if (editing) {
    return (
      <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
        <td className="px-4 py-3">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="input py-1 text-xs"
            style={{ width: "100%", maxWidth: 180 }}
            autoFocus
          />
        </td>
        <td className="px-4 py-3 mono-value text-xs" style={{ color: "var(--text-3)" }}>
          {cat.slug}
        </td>
        <td className="px-4 py-3" colSpan={2}>
          <input
            type="text"
            value={description}
            onChange={e => setDesc(e.target.value)}
            className="input py-1 text-xs"
            style={{ width: "100%", maxWidth: 300 }}
            placeholder="Description…"
          />
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {err && <span className="text-[10px]" style={{ color: "var(--signal-danger)" }}>{err}</span>}
            <button onClick={save} disabled={busy} className="btn-success btn-sm" style={{ padding: "3px 8px" }}>
              <Check className="w-3 h-3" />
            </button>
            <button onClick={cancel} disabled={busy} className="btn-ghost btn-sm" style={{ padding: "3px 8px" }}>
              <X className="w-3 h-3" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr style={{ borderBottom: "1px solid var(--border)" }}>
      <td className="px-4 py-3 text-xs font-medium" style={{ color: "var(--text-1)" }}>
        {cat.name}
      </td>
      <td className="px-4 py-3 mono-value text-xs" style={{ color: "var(--text-3)" }}>
        {cat.slug}
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: "var(--text-2)", maxWidth: 240 }}>
        {cat.description ?? "—"}
      </td>
      <td className="px-4 py-3 mono-value text-xs" style={{ color: "var(--text-3)" }}>
        {cat.plugin_count}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {err && <span className="text-[10px]" style={{ color: "var(--signal-danger)" }}>{err}</span>}
          <button onClick={() => setEditing(true)} disabled={busy} className="btn-ghost btn-sm" style={{ padding: "3px 8px" }}>
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={handleDelete} disabled={busy} className="btn-ghost btn-sm" style={{ padding: "3px 8px", color: "var(--signal-danger)" }}>
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function CategoriesPage() {
  const [cats, setCats]       = useState<CategoryAdminOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);

  async function load() {
    setLoading(true);
    try { setCats(await categoriesApi.list()); }
    catch { setCats([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function autoSlug(name: string) {
    return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  }

  async function handleCreate() {
    if (!newName.trim() || !newSlug.trim()) {
      setCreateErr("Nom et slug requis");
      return;
    }
    setCreateBusy(true);
    setCreateErr(null);
    try {
      const created = await categoriesApi.create({
        name: newName.trim(),
        slug: newSlug.trim(),
        description: newDesc.trim() || undefined,
      });
      setCats(prev => [...prev, created]);
      setNewName(""); setNewSlug(""); setNewDesc("");
      setCreating(false);
    } catch (e) {
      setCreateErr(e instanceof AdminApiError ? e.message : "Erreur");
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--text-1)" }}>
            Catégories
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-3)" }}>
            {cats.length} catégorie{cats.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="btn-ghost btn-sm">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={() => setCreating(v => !v)} className="btn-primary btn-sm">
            <Plus className="w-3.5 h-3.5" />
            Nouvelle catégorie
          </button>
        </div>
      </div>

      {/* Create form */}
      {creating && (
        <div className="panel p-4 space-y-3">
          <h2 className="section-label">Créer une catégorie</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-3)" }}>Nom</label>
              <input
                type="text"
                value={newName}
                onChange={e => { setNewName(e.target.value); if (!newSlug) setNewSlug(autoSlug(e.target.value)); }}
                className="input text-xs"
                placeholder="Ex: Security"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--text-3)" }}>Slug</label>
              <input
                type="text"
                value={newSlug}
                onChange={e => setNewSlug(e.target.value)}
                className="input text-xs mono-value"
                placeholder="ex: security"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-3)" }}>Description (optionnel)</label>
            <input
              type="text"
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              className="input text-xs"
              placeholder="Courte description…"
            />
          </div>
          {createErr && <p className="text-xs" style={{ color: "var(--signal-danger)" }}>{createErr}</p>}
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={createBusy} className="btn-primary btn-sm">
              <Check className="w-3.5 h-3.5" /> Créer
            </button>
            <button onClick={() => { setCreating(false); setCreateErr(null); }} className="btn-ghost btn-sm">
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Nom", "Slug", "Description", "Plugins", "Actions"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "var(--text-3)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="skeleton h-4 rounded" style={{ width: j === 2 ? 160 : 80 }} />
                      </td>
                    ))}
                  </tr>
                ))
              : cats.map(c => (
                  <CategoryRow
                    key={c.id}
                    cat={c}
                    onUpdated={updated => setCats(prev => prev.map(x => x.id === updated.id ? updated : x))}
                    onDeleted={id => setCats(prev => prev.filter(x => x.id !== id))}
                  />
                ))}
          </tbody>
        </table>
        {!loading && cats.length === 0 && (
          <div className="py-16 text-center text-sm" style={{ color: "var(--text-3)" }}>
            Aucune catégorie.
          </div>
        )}
      </div>
    </div>
  );
}
