"use client"

import { useEffect, useState } from "react"
import { BookOpen, Code2, FileText, Sparkles, X } from "lucide-react"
import Image from "next/image"
import type { Plugin } from "@/types/plugin"
import type { PluginRatingsSummary } from "@/types/rating"
import { getPluginDocs } from "@/services/pluginService"

interface PluginDetailsModalProps {
  plugin: Plugin | null
  isOpen: boolean
  onClose: () => void
  ratings?: PluginRatingsSummary
}

type DocsTab = "readme" | "integration" | "contributor"

export default function PluginDetailsModal({ plugin, isOpen, onClose, ratings }: PluginDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<DocsTab>("readme")
  const [docs, setDocs] = useState<Awaited<ReturnType<typeof getPluginDocs>> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !plugin) return

    let cancelled = false

    getPluginDocs(plugin.slug)
      .then((response) => {
        if (!cancelled) setDocs(response)
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load plugin docs right now")
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, plugin])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !plugin) return null

  const docsLoading = !docs && !error
  const hasRatings = ratings && (ratings.count > 0 || ratings.myRating !== null)

  const tabContent = {
    readme: docs?.readme ?? "",
    integration: docs?.integration ?? "",
    contributor: docs?.contributor ? JSON.stringify(docs.contributor, null, 2) : "",
  }

  const tabLabel = {
    readme: "README.md",
    integration: "integration.md",
    contributor: "contributor.yaml",
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70 backdrop-blur-md p-3 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${plugin.name} details`}
        className="relative flex w-full max-w-6xl max-h-[calc(100vh-1.5rem)] flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl sm:max-h-[calc(100vh-2rem)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-primary/10 via-transparent to-emerald-500/10" />

        <div className="relative flex items-start justify-between gap-4 border-b border-border p-5 sm:p-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/[0.05]">
              <Image src="/mascot.svg" alt="Mascot" width={44} height={44} className="h-11 w-11 object-contain" unoptimized />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground sm:text-xl">{plugin.name}</h2>
                <span className="rounded-full border border-border bg-foreground/[0.03] px-2 py-0.5 text-[11px] font-mono text-foreground/50">
                  {plugin.slug}
                </span>
              </div>
              <p className="mt-1 max-w-3xl text-sm text-foreground/55">
                {plugin.description || "No description provided for this plugin."}
              </p>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-border bg-foreground/[0.03] px-2.5 py-1 text-foreground/65">
                  Version {plugin.version}
                </span>
                <span className="rounded-full border border-border bg-foreground/[0.03] px-2.5 py-1 text-foreground/65">
                  Latest validated {docs?.version ?? "loading..."}
                </span>
                {hasRatings && (
                  <span className="rounded-full border border-border bg-foreground/[0.03] px-2.5 py-1 text-foreground/65">
                    {ratings!.average === null ? "No ratings" : `${ratings!.average.toFixed(1)} / 5 (${ratings!.count})`}
                    {ratings!.myRating !== null ? ` · My rating ${ratings!.myRating.toFixed(1)}` : ""}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-foreground/45 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
            aria-label="Close details"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(280px,320px),1fr]">
          <aside className="border-b border-border p-5 lg:border-b-0 lg:border-r lg:p-6 lg:overflow-y-auto">
            <div className="rounded-2xl border border-border bg-background/40 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10">
                  <Sparkles size={20} strokeWidth={1.8} />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Developer view</p>
                  <p className="text-xs text-foreground/45">Plugin overview and extracted docs</p>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-sm text-foreground/65">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-foreground/[0.025] px-3 py-2.5">
                  <span className="text-foreground/45">Status</span>
                  <span className="font-medium text-foreground capitalize">{plugin.status || "unknown"}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-foreground/[0.025] px-3 py-2.5">
                  <span className="text-foreground/45">Docs version</span>
                  <span className="font-medium text-foreground">{docs?.version ?? "Loading"}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-foreground/[0.025] px-3 py-2.5">
                  <span className="text-foreground/45">Extracted at</span>
                  <span className="font-medium text-foreground">
                    {docs?.extracted_at ? new Date(docs.extracted_at).toLocaleString() : "Loading"}
                  </span>
                </div>
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 flex-col p-5 sm:p-6 lg:overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
              {([
                ["readme", BookOpen],
                ["integration", Code2],
                ["contributor", FileText],
              ] as const).map(([tab, Icon]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${activeTab === tab ? "bg-primary text-white shadow-sm" : "bg-foreground/[0.03] text-foreground/60 hover:text-foreground hover:bg-foreground/[0.06]"}`}
                >
                  <Icon size={14} strokeWidth={1.9} />
                  {tabLabel[tab]}
                </button>
              ))}
            </div>

            <div className="mt-4 flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-background/40 shadow-inner">
              {docsLoading ? (
                <div className="space-y-3 p-5">
                  <div className="h-5 w-40 animate-pulse rounded bg-foreground/5" />
                  <div className="h-4 w-full animate-pulse rounded bg-foreground/5" />
                  <div className="h-4 w-11/12 animate-pulse rounded bg-foreground/5" />
                  <div className="h-4 w-10/12 animate-pulse rounded bg-foreground/5" />
                  <div className="h-4 w-8/12 animate-pulse rounded bg-foreground/5" />
                </div>
              ) : error ? (
                <div className="p-5 text-sm text-red-400">{error}</div>
              ) : (
                <div className="h-full min-h-0 overflow-y-auto p-4 sm:p-5">
                  <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-foreground/40">
                    <BookOpen size={13} />
                    {tabLabel[activeTab]}
                  </div>
                  <pre className="whitespace-pre-wrap break-words rounded-xl border border-border/60 bg-background/50 p-4 text-sm leading-6 text-foreground/80 shadow-sm">
                    {tabContent[activeTab] || "No content available for this document."}
                  </pre>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
