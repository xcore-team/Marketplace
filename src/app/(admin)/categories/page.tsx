"use client";

import { useEffect, useState } from "react";
import { categoriesApi, type CategoryAdminOut, AdminApiError } from "@/lib/admin-api";
import { Plus, Trash2, RefreshCw, Check, X, Tag } from "lucide-react";

// ── Category card ─────────────────────────────────────────────────────────────

function CategoryCard({
  cat,
  onDeleted,
}: {
  cat: CategoryAdminOut;
  onDeleted: (id: string) => void;
}) {
  const [busy,       setBusy]    = useState(false);
  const [err,        setErr]     = useState<string | null>(null);
  const [confirmDel, setConfirm] = useState(false);

  async function handleDelete() {
    setBusy(true); setErr(null);
    try {
      await categoriesApi.delete(cat.slug);
      onDeleted(cat.id);
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur");
      setBusy(false);
    }
  }

  return (
    <div
      className="panel p-4 flex flex-col gap-0 group"
      style={{
        opacity: busy ? 0.5 : 1,
        transition: "opacity 150ms, border-color 150ms",
      }}
    >
      {/* Top row: name + plugin count */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span
          className="font-display text-sm font-semibold leading-snug"
          style={{ color: "var(--text-1)" }}
        >
          {cat.name}
        </span>
        <span
          className="mono-value text-[11px] px-1.5 py-0.5 rounded flex-shrink-0"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-3)",
          }}
        >
          {cat.plugin_count ?? 0}
        </span>
      </div>

      {/* Slug */}
      <span
        className="mono-value text-[11px] block mb-2"
        style={{ color: "var(--text-3)" }}
      >
        /{cat.slug}
      </span>

      {/* Description */}
      <p
        className="text-xs leading-relaxed flex-1 line-clamp-2"
        style={{ color: cat.description ? "var(--text-2)" : "var(--text-3)" }}
      >
        {cat.description ?? "No description."}
      </p>

      {/* Action row */}
      <div
        className="flex items-center justify-between pt-3 mt-3"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        {confirmDel ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] mono-value" style={{ color: "var(--signal-danger)" }}>
              Delete?
            </span>
            <button onClick={handleDelete} disabled={busy} className="btn-danger btn-xs">Y</button>
            <button onClick={() => setConfirm(false)} className="btn-ghost btn-xs">N</button>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)} disabled={busy} className="btn-danger btn-xs">
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        )}

        {err && (
          <span className="text-[10px] mono-value truncate max-w-[120px]" style={{ color: "var(--signal-danger)" }}>
            {err}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Create card ───────────────────────────────────────────────────────────────

function CreateCard({
  onCreated,
  onCancel,
}: {
  onCreated: (c: CategoryAdminOut) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err,  setErr]  = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) { setErr("Name required"); return; }
    setBusy(true); setErr(null);
    try {
      const created = await categoriesApi.create({
        name: name.trim(),
        description: desc.trim() || undefined,
      });
      onCreated(created);
    } catch (e) {
      setErr(e instanceof AdminApiError ? e.message : "Erreur");
      setBusy(false);
    }
  }

  return (
    <div
      className="p-4 flex flex-col gap-3 rounded-xl"
      style={{
        background: "var(--surface)",
        border: "2px dashed var(--border)",
        opacity: busy ? 0.6 : 1,
        transition: "opacity 150ms",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plus className="w-3.5 h-3.5" style={{ color: "var(--xcore)" }} />
          <span
            className="mono-value text-[10px] uppercase tracking-widest"
            style={{ color: "var(--xcore)" }}
          >
            New Category
          </span>
        </div>
        <button onClick={onCancel} className="btn-ghost btn-xs">
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Name */}
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        className="input text-sm"
        placeholder="Category name"
        autoFocus
        onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") onCancel(); }}
      />

      {/* Description */}
      <textarea
        value={desc}
        onChange={e => setDesc(e.target.value)}
        className="input text-xs resize-none"
        rows={2}
        placeholder="Description (optional)"
      />

      {err && (
        <p className="text-[11px]" style={{ color: "var(--signal-danger)" }}>{err}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={handleCreate}
          disabled={busy || !name.trim()}
          className="btn-primary btn-sm"
        >
          <Check className="w-3 h-3" />
          Create
        </button>
        <button onClick={onCancel} className="btn-ghost btn-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard({ delay }: { delay: number }) {
  return (
    <div
      className="panel p-4 flex flex-col gap-3"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="skeleton h-4 rounded w-28" />
        <div className="skeleton h-4 rounded w-10" />
      </div>
      <div className="skeleton h-3 rounded w-20" />
      <div className="space-y-1.5">
        <div className="skeleton h-3 rounded w-full" />
        <div className="skeleton h-3 rounded w-3/4" />
      </div>
      <div
        className="flex items-center justify-between pt-3 mt-1"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div className="skeleton h-5 rounded w-14" />
        <div className="skeleton h-5 rounded w-10" />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CategoriesPage() {
  const [cats,     setCats]     = useState<CategoryAdminOut[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    try { setCats(await categoriesApi.list()); }
    catch { setCats([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  return (
    <div>

      {/* ── Sticky page header ─────────────────────────────────────────────── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <h1 className="page-title">
            <span className="page-title-prefix">/</span>
            Categories
          </h1>
          {!loading && (
            <span className="badge-gray mono-value" style={{ fontSize: 10 }}>
              {cats.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="btn-ghost btn-sm"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setCreating(v => !v)}
            className={creating ? "btn-ghost btn-sm" : "btn-primary btn-sm"}
          >
            {creating ? (
              <>
                <X className="w-3.5 h-3.5" />
                Cancel
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                New Category
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Page content ───────────────────────────────────────────────────── */}
      <div className="page-content">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 max-w-5xl">

          {/* Create card — first slot */}
          {creating && (
            <CreateCard
              onCreated={c => {
                setCats(prev => [...prev, { ...c, plugin_count: c.plugin_count ?? 0 }]);
                setCreating(false);
              }}
              onCancel={() => setCreating(false)}
            />
          )}

          {/* Skeleton grid */}
          {loading &&
            Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} delay={i * 50} />
            ))
          }

          {/* Category cards */}
          {!loading &&
            cats.map(c => (
              <CategoryCard
                key={c.id}
                cat={c}
                onDeleted={id =>
                  setCats(prev => prev.filter(x => x.id !== id))
                }
              />
            ))
          }
        </div>

        {/* Empty state */}
        {!loading && cats.length === 0 && !creating && (
          <div
            className="mt-4 py-20 rounded-xl text-center max-w-5xl"
            style={{ border: "1px dashed var(--border)" }}
          >
            <Tag
              className="w-8 h-8 mx-auto mb-3"
              style={{ color: "var(--text-3)", opacity: 0.4 }}
            />
            <p
              className="text-sm"
              style={{ color: "var(--text-3)" }}
            >
              No categories yet. Create one to get started.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
