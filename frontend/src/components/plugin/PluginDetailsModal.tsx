"use client"

import { useEffect, useState } from "react"
import {
  BookOpen, Check, ChevronDown, ChevronUp,
  Code2, Download, ExternalLink, GitBranch,
  Package, Shield, Star, Users, X,
} from "lucide-react"
import Image from "next/image"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { Plugin, PublicPlugin, PluginDocs } from "@/types/plugin"
import { developerDisplayName } from "@/types/plugin"
import { getPluginDocs, ratePlugin, getMyRating } from "@/services/pluginService"
import { useAuthStore } from "@/lib/auth/authStore"
import StarRating from "./StarRating"

type AnyPlugin = Plugin | PublicPlugin

function isPublic(p: AnyPlugin): p is PublicPlugin {
  return "avg_rating" in p
}

interface PluginDetailsModalProps {
  plugin: AnyPlugin | null
  isOpen: boolean
  onClose: () => void
  ratings?: unknown // accepted but unused — kept for dashboard compatibility
}

type DocTab = "readme" | "integration" | "contributor"

const TABS: { id: DocTab; label: string; icon: typeof BookOpen }[] = [
  { id: "readme",      label: "README",       icon: BookOpen },
  { id: "integration", label: "Integration",  icon: Code2 },
  { id: "contributor", label: "Contributors", icon: Users },
]

function scoreColor(score: number) {
  if (score <= 30) return "text-emerald-400"
  if (score <= 79) return "text-amber-400"
  return "text-red-400"
}

export default function PluginDetailsModal({ plugin, isOpen, onClose }: PluginDetailsModalProps) {
  const [activeTab, setActiveTab]         = useState<DocTab>("readme")
  const [docs, setDocs]                   = useState<PluginDocs | null>(null)
  const [docsError, setDocsError]         = useState<string | null>(null)
  const [showAllVersions, setShowAllVersions] = useState(false)

  const [userRating, setUserRating]         = useState<number | null>(null)
  const [ratingLoading, setRatingLoading]   = useState(false)
  const [ratingSubmitting, setRatingSubmitting] = useState(false)

  const isAuth = useAuthStore(s => s.isAuthenticated)
  const authUser = useAuthStore(s => s.user)

  useEffect(() => {
    if (!isOpen || !plugin) { setDocs(null); setDocsError(null); setUserRating(null); return }
    if (isAuth) {
      setRatingLoading(true)
      getMyRating(plugin.slug).then(r => setUserRating(r?.score ?? null)).finally(() => setRatingLoading(false))
    }
  }, [isOpen, plugin, isAuth])

  useEffect(() => {
    if (!isOpen || !plugin) { setDocs(null); setDocsError(null); return }
    let cancelled = false
    setActiveTab("readme")
    getPluginDocs(plugin.slug)
      .then(d  => { if (!cancelled) setDocs(d) })
      .catch(() => { if (!cancelled) setDocsError("Documentation unavailable for this plugin.") })
    return () => { cancelled = true }
  }, [isOpen, plugin])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, onClose])

  if (!isOpen || !plugin) return null

  // Normalize both Plugin and PublicPlugin into a single consistent shape
  const p = isPublic(plugin) ? plugin : null
  const name          = plugin.name
  const slug          = plugin.slug
  const description   = plugin.description ?? null
  const latestVersion = p?.latest_version ?? (isPublic(plugin) ? null : (plugin as Plugin).version ?? null)
  const isPublished   = p?.is_published ?? ((plugin as Plugin).status === "published")
  const downloadCount = p?.download_count ?? null
  const ratingCount   = p?.rating_count ?? null
  const avgRating     = p?.avg_rating ?? null
  const homepage      = p?.homepage ?? null
  const repository    = p?.repository ?? null
  const categories    = p?.categories ?? []
  const versions      = p?.versions ?? []

  const docsLoading = !docs && !docsError

  const tabContent: Record<DocTab, string> = {
    readme:      docs?.readme      ?? "",
    integration: docs?.integration ?? "",
    contributor: "",
  }

  const contributorData = docs?.contributor as Record<string, unknown> | null
  const contributorList = contributorData?.contributors as Array<Record<string, string>> | null

  const versionsToShow = showAllVersions ? versions : versions.slice(0, 4)

  async function handleRate(score: number) {
    if (!plugin || ratingSubmitting) return
    setRatingSubmitting(true)
    try {
      await ratePlugin(plugin.slug, { score })
      setUserRating(score)
    } catch {
      // silently fail
    }
    setRatingSubmitting(false)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-background/75 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name} details`}
        className="
          relative flex w-full max-w-4xl flex-col overflow-hidden
          max-h-[92dvh] sm:max-h-[88dvh]
          rounded-t-3xl sm:rounded-3xl
          border border-border bg-surface shadow-2xl
        "
        onClick={e => e.stopPropagation()}
      >

        {/* -- Header ------------------------------------------------ */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 w-10 h-10 rounded-xl border border-primary/15 bg-primary/[0.05] flex items-center justify-center">
              <Image src="/mascot.svg" alt="" width={28} height={18} unoptimized />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <h2 className="text-[15px] font-bold text-foreground tracking-tight">{name}</h2>
                <span className="px-2 py-px rounded-full border border-border text-[10px] font-mono text-foreground/40">
                  {slug}
                </span>
                {latestVersion && (
                  <span className="px-2 py-px rounded-full border border-primary/20 bg-primary/[0.07] text-[10px] font-mono text-primary/70">
                    v{latestVersion}
                  </span>
                )}
              </div>
              <p className="text-[12px] text-foreground/48 leading-relaxed line-clamp-2 max-w-xl">
                {description ?? "No description provided for this plugin."}
              </p>
              {p?.dev_mail && (
                <p className="text-[11px] font-mono text-foreground/30 mt-1.5">
                  by {developerDisplayName(p.dev_mail, authUser?.email, authUser?.user?.full_name)}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full border border-border text-foreground/38 hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
            aria-label="Close"
          >
            <X size={13} strokeWidth={2} />
          </button>
        </div>

        {/* -- Body -------------------------------------------------- */}
        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[220px_1fr]">

          {/* Sidebar */}
          <aside className="overflow-y-auto border-b border-border lg:border-b-0 lg:border-r px-4 py-4 space-y-5">

            {/* Stats */}
            <div>
              <p className="text-[9px] font-mono text-foreground/28 tracking-widest uppercase mb-2">Stats</p>
              <div className="space-y-1">
                <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-foreground/[0.025] border border-border/50">
                  <div className="flex items-center gap-1.5 text-[11px] text-foreground/42">
                    <Download size={10} strokeWidth={1.8} /> Downloads
                  </div>
                  <span className="text-[11px] font-mono text-foreground/60">
                    {downloadCount !== null ? downloadCount.toLocaleString("fr-FR") : "—"}
                  </span>
                </div>
                <div className="py-1.5 px-2.5 rounded-lg bg-foreground/[0.025] border border-border/50">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-foreground/42">
                      <Star size={10} strokeWidth={1.8} /> Rating
                    </div>
                    {ratingCount !== null && ratingCount > 0 && (
                      <span className="text-[10px] font-mono text-foreground/35">{avgRating!.toFixed(1)}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StarRating
                      value={avgRating ?? 0}
                      count={ratingCount ?? 0}
                      interactive={isAuth}
                      onRate={handleRate}
                      userRating={userRating}
                      loading={ratingLoading || ratingSubmitting}
                      size={12}
                    />
                    {!isAuth && (
                      <span className="text-[9px] text-foreground/25 ml-auto">sign in to rate</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-foreground/[0.025] border border-border/50">
                  <div className="flex items-center gap-1.5 text-[11px] text-foreground/42">
                    <Check size={10} strokeWidth={1.8} /> Status
                  </div>
                  <span className={`text-[11px] font-mono ${isPublished ? "text-emerald-400" : "text-foreground/38"}`}>
                    {isPublished ? "published" : "unlisted"}
                  </span>
                </div>
              </div>
            </div>

            {/* Categories */}
            {categories.length > 0 && (
              <div>
                <p className="text-[9px] font-mono text-foreground/28 tracking-widest uppercase mb-2">Categories</p>
                <div className="flex flex-wrap gap-1">
                  {categories.map(c => (
                    <span key={c.id} className="px-2 py-0.5 rounded-full border border-border text-[10px] font-mono text-foreground/45">
                      #{c.slug}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Links */}
            {(homepage || repository) && (
              <div>
                <p className="text-[9px] font-mono text-foreground/28 tracking-widest uppercase mb-2">Links</p>
                <div className="space-y-1">
                  {homepage && (
                    <a
                      href={homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-border text-[11px] text-foreground/45 hover:text-primary/70 hover:border-primary/20 transition-colors"
                    >
                      <ExternalLink size={10} strokeWidth={1.8} /> Homepage
                    </a>
                  )}
                  {repository && (
                    <a
                      href={repository}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-border text-[11px] text-foreground/45 hover:text-primary/70 hover:border-primary/20 transition-colors"
                    >
                      <GitBranch size={10} strokeWidth={1.8} /> Repository
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Versions */}
            {versions.length > 0 && (
              <div>
                <p className="text-[9px] font-mono text-foreground/28 tracking-widest uppercase mb-2">
                  Versions · {versions.length}
                </p>
                <div className="space-y-1">
                  {versionsToShow.map(v => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-foreground/[0.02] border border-border/50"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Shield size={9} className="shrink-0 text-foreground/22" strokeWidth={1.8} />
                        <span className="text-[11px] font-mono text-foreground/55 truncate">
                          v{v.version}
                        </span>
                        {v.is_yanked && (
                          <span className="text-[9px] font-mono text-red-400/65 shrink-0">yanked</span>
                        )}
                        {v.is_stable && !v.is_yanked && (
                          <span className="text-[9px] font-mono text-emerald-400/55 shrink-0">stable</span>
                        )}
                      </div>
                      <span className={`text-[10px] font-mono shrink-0 ml-2 ${scoreColor(v.anomaly_score)}`}>
                        {v.anomaly_score}
                      </span>
                    </div>
                  ))}
                  {versions.length > 4 && (
                    <button
                      onClick={() => setShowAllVersions(s => !s)}
                      className="w-full flex items-center justify-center gap-1 py-1 text-[10px] font-mono text-foreground/28 hover:text-foreground/55 transition-colors"
                    >
                      {showAllVersions
                        ? <><ChevronUp size={9} /> less</>
                        : <><ChevronDown size={9} /> {versions.length - 4} more</>
                      }
                    </button>
                  )}
                </div>

                {/* Score legend */}
                <div className="mt-3 space-y-0.5">
                  {[
                    { dot: "bg-emerald-400", label: "≤30 · safe" },
                    { dot: "bg-amber-400",   label: "31–79 · review" },
                    { dot: "bg-red-400",     label: "≥80 · rejected" },
                  ].map(r => (
                    <div key={r.label} className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.dot}`} />
                      <span className="text-[9px] font-mono text-foreground/28">{r.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* Docs panel */}
          <section className="flex flex-col min-h-0 overflow-hidden">

            {/* Tab bar */}
            <div className="flex items-center gap-0 border-b border-border px-4 shrink-0">
              {TABS.map(tab => {
                const hasContent = !docsLoading && tabContent[tab.id].length > 0
                const isDisabled = !docsLoading && !docsError && !hasContent
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => !isDisabled && setActiveTab(tab.id)}
                    className={`
                      inline-flex items-center gap-1.5 px-3 py-3 text-[11px] font-mono
                      border-b-2 -mb-px transition-colors
                      ${activeTab === tab.id
                        ? "border-primary text-primary"
                        : isDisabled
                          ? "border-transparent text-foreground/20 cursor-default"
                          : "border-transparent text-foreground/40 hover:text-foreground/65"
                      }
                    `}
                  >
                    <tab.icon size={11} strokeWidth={1.8} />
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Content area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {docsLoading && (
                <div className="space-y-2 pt-1">
                  {[100, 88, 74, 92, 60, 78, 85, 50].map((w, i) => (
                    <div
                      key={i}
                      className="h-3 rounded-lg bg-foreground/[0.05] animate-pulse"
                      style={{ width: `${w}%`, animationDelay: `${i * 60}ms` }}
                    />
                  ))}
                </div>
              )}

              {!docsLoading && docsError && (
                <div className="py-12 flex flex-col items-center gap-3 text-center">
                  <Package size={26} className="text-foreground/15" strokeWidth={1.5} />
                  <p className="text-xs text-foreground/30">{docsError}</p>
                </div>
              )}

              {!docsLoading && !docsError && (
                activeTab === "contributor" && contributorData
                  ? (
                    <div className="space-y-4">
                      {/* Plugin metadata */}
                      <div className="rounded-xl border border-border bg-foreground/[0.02] p-4 space-y-2.5">
                        {(contributorData.name as string) && (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-foreground/28 uppercase tracking-widest">Name</span>
                            <span className="text-[12px] font-mono text-foreground/60">{contributorData.name as string}</span>
                          </div>
                        )}
                        {(contributorData.author as string) && (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-foreground/28 uppercase tracking-widest">Author</span>
                            <span className="text-[12px] font-mono text-foreground/60">{contributorData.author as string}</span>
                          </div>
                        )}
                        {(contributorData.email as string) && (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-foreground/28 uppercase tracking-widest">Email</span>
                            <span className="text-[12px] font-mono text-foreground/60">{contributorData.email as string}</span>
                          </div>
                        )}
                        {(contributorData.license as string) && (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-foreground/28 uppercase tracking-widest">License</span>
                            <span className="text-[12px] font-mono text-primary/70">{contributorData.license as string}</span>
                          </div>
                        )}
                        {(contributorData.github as string) && (
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono text-foreground/28 uppercase tracking-widest">Repository</span>
                            <a
                              href={contributorData.github as string}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[12px] font-mono text-primary/60 hover:text-primary transition-colors truncate max-w-[140px]"
                            >
                              {contributorData.github as string}
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Contributors list */}
                      {contributorList && contributorList.length > 0 && (
                        <div>
                          <p className="text-[9px] font-mono text-foreground/28 tracking-widest uppercase mb-2">
                            Contributors · {contributorList.length}
                          </p>
                          <div className="space-y-1">
                            {contributorList.map((c, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between py-2 px-3 rounded-lg border border-border/60 bg-foreground/[0.015]"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                    <span className="text-[9px] font-mono font-semibold text-primary/60">
                                      {(c.name ?? "?")[0].toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-[12px] font-medium text-foreground/70 truncate">{c.name}</p>
                                    {c.role && (
                                      <p className="text-[10px] font-mono text-foreground/30 truncate">{c.role}</p>
                                    )}
                                  </div>
                                </div>
                                {c.github && (
                                  <a
                                    href={`https://github.com/${c.github}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] font-mono text-foreground/30 hover:text-primary/60 transition-colors shrink-0 ml-2"
                                  >
                                    @{c.github}
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                  : tabContent[activeTab] && (
                    <div className="prose-doc">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {tabContent[activeTab]}
                      </ReactMarkdown>
                    </div>
                  )
              )}

              {!docsLoading && !docsError && (
                activeTab !== "contributor" ? !tabContent[activeTab] : !contributorData
              ) && (
                <div className="py-12 flex flex-col items-center gap-3 text-center">
                  <p className="text-xs text-foreground/28">No content available for this document.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
