"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, useInView } from "framer-motion"
import { Package, Search, X } from "lucide-react"
import { getCategories, getPublishedPlugins } from "@/services/pluginService"
import MarketplaceCard from "@/components/plugin/MarketplaceCard"
import type { Category, PublicPlugin } from "@/types/plugin"

const PAGE_SIZE = 12

const SORT_OPTIONS = [
  { value: "newest",    label: "Newest" },
  { value: "rating",   label: "Top Rated" },
  { value: "downloads", label: "Most Used" },
] as const
type SortOption = typeof SORT_OPTIONS[number]["value"]

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-50px" })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 14 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.38, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

interface PluginBrowserProps {
  onOpenDetails: (plugin: PublicPlugin) => void
}

export default function PluginBrowser({ onOpenDetails }: PluginBrowserProps) {
  const [plugins, setPlugins]               = useState<PublicPlugin[]>([])
  const [total, setTotal]                   = useState(0)
  const [hasMore, setHasMore]               = useState(false)
  const [loading, setLoading]               = useState(true)
  const [loadingMore, setLoadingMore]       = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  const [categories, setCategories]         = useState<Category[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [search, setSearch]                 = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [sort, setSort]                     = useState<SortOption>("newest")

  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const browserRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebouncedSearch(search), 320)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [search])

  useEffect(() => { getCategories().then(setCategories).catch(() => {}) }, [])

  const loadPlugins = useCallback(async (offset: number) => {
    try {
      const res = await getPublishedPlugins({
        limit: PAGE_SIZE,
        offset,
        search: debouncedSearch || undefined,
        category_id: activeCategory ?? undefined,
        sort,
      })
      if (offset === 0) setPlugins(res.items)
      else setPlugins(prev => [...prev, ...res.items])
      setTotal(res.total)
      setHasMore(res.has_more)
    } catch {
      setError("Unable to reach the plugin registry. Please try again.")
    }
  }, [debouncedSearch, activeCategory, sort])

  useEffect(() => {
    setLoading(true)
    setError(null)
    loadPlugins(0).finally(() => setLoading(false))
  }, [loadPlugins])

  function handleLoadMore() {
    setLoadingMore(true)
    loadPlugins(plugins.length).finally(() => setLoadingMore(false))
  }

  return (
    <section ref={browserRef} className="py-5 sm:py-7">
      <div className="mx-auto max-w-5xl px-6">

        <FadeIn>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
            <div>
              <p className="text-[10px] font-mono text-primary/50 tracking-widest uppercase mb-1.5">Marketplace</p>
              <h2 className="text-xl font-bold tracking-tight text-foreground flex items-baseline gap-3">
                Published plugins
                {!loading && total > 0 && (
                  <span className="text-sm font-normal text-foreground/30">
                    {total.toLocaleString()} available
                  </span>
                )}
              </h2>
            </div>

            <div className="flex items-center gap-2 border border-border rounded-xl px-3.5 py-2 bg-surface w-full sm:w-60 focus-within:border-primary/30 transition-colors">
              <Search size={12} className="text-foreground/25 shrink-0" strokeWidth={1.8} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search plugins…"
                className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-foreground/25 focus:outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-foreground/25 hover:text-foreground/50 transition-colors">
                  <X size={12} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </FadeIn>

        {/* Category filters */}
        <FadeIn delay={0.04}>
          <div className="flex items-center gap-1.5 mb-5 overflow-x-auto scrollbar-none pb-1">
            <button
              onClick={() => setActiveCategory(null)}
              className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-colors ${
                activeCategory === null
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "border-border text-foreground/38 hover:text-foreground/60"
              }`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(p => p === cat.id ? null : cat.id)}
                className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-colors ${
                  activeCategory === cat.id
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "border-border text-foreground/38 hover:text-foreground/60"
                }`}
              >
                {cat.name}
                {cat.plugin_count > 0 && (
                  <span className="ml-1.5 opacity-40">{cat.plugin_count}</span>
                )}
              </button>
            ))}
            <div className="ml-auto shrink-0">
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortOption)}
                className="text-[11px] font-mono bg-surface border border-border rounded-lg px-2.5 py-1 text-foreground/45 focus:outline-none focus:border-primary/30 cursor-pointer transition-colors"
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </FadeIn>

        {/* Error */}
        {error && (
          <div className="mb-5 rounded-xl border border-red-500/15 bg-red-500/[0.04] px-4 py-3">
            <p className="text-xs font-mono text-red-400/70">{error}</p>
          </div>
        )}

        {/* Skeleton */}
        {loading && (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border border-border rounded-xl bg-surface overflow-hidden animate-pulse">
                <div className="px-4 py-2 border-b border-border bg-foreground/[0.018] flex justify-between">
                  <div className="h-2 w-20 rounded bg-foreground/[0.06]" />
                  <div className="h-2 w-6 rounded bg-foreground/[0.06]" />
                </div>
                <div className="p-4 space-y-2">
                  <div className="h-3 w-32 rounded bg-foreground/[0.06]" />
                  <div className="h-2 w-full rounded bg-foreground/[0.04]" />
                  <div className="h-2 w-2/3 rounded bg-foreground/[0.04]" />
                </div>
                <div className="px-4 py-2 border-t border-border flex justify-between">
                  <div className="h-2 w-16 rounded bg-foreground/[0.04]" />
                  <div className="h-2 w-8 rounded bg-foreground/[0.04]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Grid */}
        {!loading && plugins.length > 0 && (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {plugins.map((plugin, i) => (
              <MarketplaceCard
                key={plugin.id}
                plugin={plugin}
                index={i}
                onOpenDetails={onOpenDetails}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && plugins.length === 0 && (
          <div className="py-16 flex flex-col items-center gap-3 text-center">
            <div className="w-9 h-9 rounded-xl bg-foreground/[0.04] flex items-center justify-center">
              <Package size={16} className="text-foreground/20" strokeWidth={1.5} />
            </div>
            <p className="text-sm text-foreground/30">No plugins match your criteria.</p>
            {(debouncedSearch || activeCategory) && (
              <button
                onClick={() => { setSearch(""); setActiveCategory(null) }}
                className="text-xs text-primary/60 hover:text-primary transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Load more */}
        {hasMore && !loading && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="px-5 py-2 rounded-xl border border-border text-[11px] font-mono text-foreground/38 hover:text-foreground/65 hover:border-primary/20 disabled:opacity-30 transition-all"
            >
              {loadingMore ? "Loading…" : `Load more — ${(total - plugins.length).toLocaleString()} remaining`}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
