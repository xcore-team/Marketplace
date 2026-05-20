"use client"

import { ExternalLink, Tag } from "lucide-react"
import Link from "next/link"
import type { Plugin, PluginStatus } from "@/types/plugin"

// ─── Badge de statut ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  published:   { label: "Published",   classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  unpublished: { label: "Unpublished", classes: "bg-foreground/8 text-foreground/50 border-border" },
  yanked:      { label: "Yanked",      classes: "bg-red-500/10 text-red-400 border-red-500/20" },
  pending:     { label: "Pending",     classes: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
}

function StatusBadge({ status }: { status: PluginStatus }) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG["unpublished"]
  const { label, classes } = config
  return (
    <span className={`
      inline-flex items-center px-2 py-0.5
      text-xs font-medium rounded-full border
      ${classes}
    `}>
      {label}
    </span>
  )
}
// ─── PluginCard ───────────────────────────────────────────────────────────

interface PluginCardProps {
  plugin: Plugin
}

export default function PluginCard({ plugin }: PluginCardProps) {
  return (
    <div className="
      flex items-center justify-between
      bg-surface border border-border rounded-xl px-5 py-4
      hover:border-primary/20 hover:bg-primary/[0.02]
      transition-all duration-200
      group
    ">
      {/* Infos principales */}
      <div className="flex items-center gap-4 min-w-0">
        {/* Icône */}
        <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Tag size={15} className="text-primary" strokeWidth={1.8} />
        </div>

        {/* Nom + description */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-foreground truncate">
              {plugin.name}
            </span>
            <span className="text-xs text-foreground/30 font-mono shrink-0">
              v{plugin.version}
            </span>
          </div>
          <p className="text-xs text-foreground/45 truncate">
            {plugin.description}
          </p>
        </div>
      </div>

      {/* Statut + lien */}
      <div className="flex items-center gap-3 shrink-0 ml-4">
        <StatusBadge status={plugin.status} />

        <Link
          href={`/plugins/${plugin.slug}`}
          className="
            opacity-0 group-hover:opacity-100
            text-foreground/30 hover:text-foreground
            transition-all duration-200
          "
          aria-label={`View ${plugin.name}`}
        >
          <ExternalLink size={15} strokeWidth={1.8} />
        </Link>
      </div>
    </div>
  )
}