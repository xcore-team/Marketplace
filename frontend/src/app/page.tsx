"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import { motion, useInView } from "framer-motion"
import MascotHero from "@/components/ui/MascotHero"
import {
  Activity, ArrowRight, ArrowUpRight, Box, CheckCircle,
  Code2, FileCheck, Fingerprint, HeartPulse, Key,
  Package, Scale, Search, Shield, X, Zap,
} from "lucide-react"
import { getCategories, getPublishedPlugins } from "@/services/pluginService"
import MarketplaceCard from "@/components/plugin/MarketplaceCard"
import PluginDetailsModal from "@/components/plugin/PluginDetailsModal"
import type { Category, PublicPlugin } from "@/types/plugin"

const PAGE_SIZE = 12

const SORT_OPTIONS = [
  { value: "newest",    label: "Newest" },
  { value: "rating",   label: "Top Rated" },
  { value: "downloads", label: "Most Used" },
] as const
type SortOption = typeof SORT_OPTIONS[number]["value"]

// ── Data ─────────────────────────────────────────────────────────────────────

const GATES = [
  { icon: FileCheck,   name: "Intake Validation",    desc: "Manifest integrity, forbidden files, typosquatting protection" },
  { icon: Code2,       name: "Static Analysis",      desc: "AST parsing, dangerous calls, taint flows" },
  { icon: Package,     name: "Supply Chain",         desc: "CVE audit, version pinning, URL imports" },
  { icon: Key,         name: "Secrets Detection",    desc: "Entropy scoring, API keys, credential patterns" },
  { icon: Box,         name: "Sandbox Execution",    desc: "Isolated runtime · 128 MB · 10 s CPU cap" },
  { icon: Activity,    name: "Behavioral Analysis",  desc: "Network activity, file I/O, abnormal syscalls" },
  { icon: Fingerprint, name: "Cryptographic Signing", desc: "Merkle root + RSA for tamper-proof distribution" },
  { icon: Scale,       name: "License Compliance",   desc: "Copyleft detection, license compatibility" },
  { icon: HeartPulse,  name: "Supply Health",        desc: "OpenSSF scorecard, maintenance frequency" },
]

const STEPS = [
  {
    n: "01",
    title: "Build your plugin",
    desc: "Write a plugin.yaml manifest, implement Python logic, add docs — README, integration guide. Package as ZIP.",
  },
  {
    n: "02",
    title: "Submit for review",
    desc: "Upload through the developer dashboard. Celery picks it up immediately. Real-time SSE keeps you updated at every step.",
  },
  {
    n: "03",
    title: "Publish and distribute",
    desc: "Score ≤ 30 → auto-published. 31–79 → manual review. ≥ 80 → rejected with full per-gate breakdown.",
  },
]

function FadeIn({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MarketplacePage() {
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

  const [selected, setSelected]             = useState<PublicPlugin | null>(null)
  const [modalOpen, setModalOpen]           = useState(false)

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

  function openDetails(plugin: PublicPlugin) { setSelected(plugin); setModalOpen(true) }
  function closeModal() { setModalOpen(false); setTimeout(() => setSelected(null), 300) }
  function scrollToBrowser() { browserRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }) }

  return (
    <div className="font-sans min-h-full bg-background">

      {/* ── 1. HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="dot-grid absolute inset-0 pointer-events-none" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse 80% 60% at 62% -8%, rgba(0,200,150,0.09) 0%, transparent 58%)" }}
        />

        <div className="relative mx-auto max-w-5xl px-6 pt-10 pb-11 sm:pt-12 sm:pb-14">
          <div className="grid lg:grid-cols-[1fr_260px] gap-6 items-center">

            {/* Left copy */}
            <div className="max-w-xl">
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.32 }}
                className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full border border-primary/20 bg-primary/[0.06]"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[10px] font-mono text-primary/70 tracking-widest uppercase">
                  Plugin Registry · XCore Framework
                </span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.42, delay: 0.06 }}
                className="text-[2.6rem] sm:text-5xl font-black tracking-tight text-foreground leading-[1.05]"
              >
                Distribute plugins<br />
                <span className="text-primary">with confidence</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.42, delay: 0.12 }}
                className="mt-4 text-[13.5px] text-foreground/45 leading-relaxed max-w-md"
              >
                The official registry for XCore framework plugins. Every submission
                passes a 9-gate automated security pipeline before it reaches any developer.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.42, delay: 0.18 }}
                className="mt-6 flex flex-wrap gap-2.5"
              >
                <button
                  onClick={scrollToBrowser}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-background text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  Browse Plugins
                  <ArrowRight size={14} strokeWidth={2.2} />
                </button>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium text-foreground/55 hover:text-foreground hover:border-primary/25 transition-colors"
                >
                  Publish a Plugin
                  <ArrowUpRight size={13} strokeWidth={2} />
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.32 }}
                className="mt-6 flex flex-wrap gap-5 border-t border-border pt-5"
              >
                {[
                  { icon: Shield,      text: "9-gate security pipeline" },
                  { icon: Zap,         text: "Real-time SSE tracking" },
                  { icon: CheckCircle, text: "Cryptographic signing" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-1.5 text-[11px] text-foreground/32">
                    <Icon size={11} strokeWidth={1.8} className="text-primary/45" />
                    {text}
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Mascot — eyes follow the cursor */}
            <div className="hidden lg:flex items-center justify-center relative">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "radial-gradient(circle 140px at 50% 55%, rgba(0,200,150,0.13) 0%, transparent 70%)" }}
              />
              <MascotHero className="relative" />
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. PLUGIN BROWSER ────────────────────────────────────────────────── */}
      <section ref={browserRef} className="py-10 sm:py-12">
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
                  onOpenDetails={openDetails}
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

      {/* ── 3. HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section className="border-y border-border py-10 sm:py-12 bg-surface/20">
        <div className="mx-auto max-w-5xl px-6">
          <FadeIn className="mb-6">
            <p className="text-[10px] font-mono text-primary/50 tracking-widest uppercase mb-2">Process</p>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              From code to registry in minutes
            </h2>
            <p className="mt-1 text-[12px] text-foreground/38 max-w-sm">
              The submission flow is async — you upload, the pipeline processes in the background.
            </p>
          </FadeIn>

          <div className="grid sm:grid-cols-3 gap-px bg-border rounded-xl overflow-hidden border border-border">
            {STEPS.map((step, i) => (
              <FadeIn key={step.n} delay={i * 0.07}>
                <div className="bg-surface p-5 h-full">
                  <span className="step-number text-4xl font-black font-mono leading-none select-none text-foreground">
                    {step.n}
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-1.5 text-[12px] text-foreground/38 leading-relaxed">{step.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. SECURITY PIPELINE ─────────────────────────────────────────────── */}
      <section className="border-b border-border py-10 sm:py-12">
        <div className="mx-auto max-w-5xl px-6">

          <FadeIn>
            <div className="flex flex-wrap items-start justify-between gap-6 mb-6">
              <div>
                <p className="text-[10px] font-mono text-primary/50 tracking-widest uppercase mb-2">Security</p>
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  9 automated security checks
                </h2>
                <p className="mt-1 text-[12px] text-foreground/38 max-w-sm">
                  Gates run in parallel after intake. Each finding has a weighted score —
                  the total determines the publication outcome.
                </p>
              </div>

              <div className="flex flex-col gap-1.5 shrink-0">
                {[
                  { dot: "bg-emerald-400", label: "Score ≤ 30", badge: "auto-published" },
                  { dot: "bg-amber-400",   label: "Score 31–79", badge: "manual review" },
                  { dot: "bg-red-400",     label: "Score ≥ 80",  badge: "rejected" },
                ].map(r => (
                  <div key={r.label} className="flex items-center gap-2.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${r.dot}`} />
                    <span className="text-[11px] font-mono text-foreground/42">{r.label}</span>
                    <span className="text-[10px] font-mono text-foreground/22">→ {r.badge}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {GATES.map((gate, i) => (
              <FadeIn key={gate.name} delay={i * 0.03}>
                <div className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-surface hover:border-primary/20 transition-colors duration-200 h-full">
                  <div className="shrink-0 w-7 h-7 rounded-lg bg-primary/[0.07] flex items-center justify-center mt-0.5">
                    <gate.icon size={13} className="text-primary/52" strokeWidth={1.8} />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-foreground">{gate.name}</p>
                    <p className="mt-0.5 text-[11px] text-foreground/36 leading-relaxed">{gate.desc}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. DEVELOPER CTA ─────────────────────────────────────────────────── */}
      <section className="py-10 sm:py-12 bg-surface/20">
        <div className="mx-auto max-w-5xl px-6">
          <FadeIn>
            <div className="relative rounded-2xl border border-border bg-surface overflow-hidden p-7 sm:p-10">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "radial-gradient(ellipse 70% 100% at 50% 130%, rgba(0,200,150,0.07) 0%, transparent 65%)" }}
              />

              <div className="relative grid md:grid-cols-[1fr_auto] gap-7 items-start">
                <div>
                  <p className="text-[10px] font-mono text-primary/50 tracking-widest uppercase mb-3">For Developers</p>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    Ready to publish your first plugin?
                  </h2>
                  <p className="mt-2 text-[13px] text-foreground/38 max-w-md leading-relaxed">
                    Implement against the XCore SDK, package as ZIP, and submit through the dashboard.
                    The pipeline gives you a full report — pass or fail, you know exactly why.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2.5">
                    <Link
                      href="/register"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-background text-sm font-semibold hover:bg-primary/90 transition-colors"
                    >
                      Create Account
                      <ArrowRight size={14} strokeWidth={2.2} />
                    </Link>
                    <Link
                      href="/login"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm text-foreground/50 hover:text-foreground hover:border-primary/20 transition-colors"
                    >
                      Sign In
                    </Link>
                  </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0 md:pt-9">
                  {[
                    "ZIP upload with drag & drop",
                    "9-gate automated security review",
                    "Full per-gate score breakdown",
                    "Real-time SSE notifications",
                    "Semantic version management",
                    "GitHub integration",
                  ].map(f => (
                    <div key={f} className="flex items-center gap-2 text-[11.5px] text-foreground/38">
                      <CheckCircle size={11} strokeWidth={1.8} className="text-primary/48 shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Modal */}
      <PluginDetailsModal
        plugin={selected}
        isOpen={modalOpen}
        onClose={closeModal}
      />
    </div>
  )
}
