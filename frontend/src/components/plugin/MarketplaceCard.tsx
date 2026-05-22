"use client"

import { motion } from "framer-motion"
import { ArrowUpRight } from "lucide-react"
import type { PublicPlugin } from "@/types/plugin"

interface MarketplaceCardProps {
  plugin: PublicPlugin
  index: number
  onOpenDetails: (plugin: PublicPlugin) => void
}

export default function MarketplaceCard({ plugin, index, onOpenDetails }: MarketplaceCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.6), ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <button
        type="button"
        onClick={() => onOpenDetails(plugin)}
        className="group w-full text-left"
      >
        <div className="
          relative overflow-hidden
          border border-border rounded-xl bg-surface
          hover:border-primary/25
          hover:shadow-[0_0_28px_rgba(0,200,150,0.06)]
          transition-all duration-300
          hover:-translate-y-px
        ">
          {/* Left accent — slides in on hover */}
          <span className="
            absolute left-0 top-0 bottom-0 w-[2px]
            bg-primary/0 group-hover:bg-primary/70
            transition-all duration-300 rounded-l-xl
          " />

          {/* Terminal header */}
          <div className="
            flex items-center justify-between
            px-4 py-2 border-b border-border
            bg-foreground/[0.018]
          ">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`
                shrink-0 w-[5px] h-[5px] rounded-full
                ${plugin.is_published ? "bg-emerald-400" : "bg-foreground/20"}
              `} />
              <span className="text-[10px] font-mono text-foreground/30 tracking-wider truncate">
                {plugin.slug}
              </span>
            </div>
            {plugin.latest_version && (
              <span className="shrink-0 text-[10px] font-mono text-primary/40 ml-2">
                v{plugin.latest_version}
              </span>
            )}
          </div>

          {/* Body */}
          <div className="px-4 pt-3.5 pb-3 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[13px] font-semibold text-foreground leading-snug tracking-tight">
                {plugin.name}
              </h3>
              <ArrowUpRight
                size={12}
                strokeWidth={2}
                className="shrink-0 mt-0.5 text-foreground/15 group-hover:text-primary/50 transition-colors duration-200"
              />
            </div>

            <p className="text-[11px] text-foreground/40 leading-relaxed line-clamp-2">
              {plugin.description ?? "No description provided for this plugin."}
            </p>

            {/* Category hashtags */}
            {plugin.categories.length > 0 && (
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                {plugin.categories.slice(0, 3).map(cat => (
                  <span
                    key={cat.id}
                    className="text-[10px] font-mono text-foreground/25 group-hover:text-primary/40 transition-colors duration-300"
                  >
                    #{cat.slug}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border">
            <span className="text-[10px] font-mono text-foreground/25">
              {plugin.rating_count === 0
                ? "— no ratings"
                : `★ ${plugin.avg_rating.toFixed(1)}  ·  ${plugin.rating_count} reviews`
              }
            </span>
            <span className="text-[10px] font-mono text-foreground/20">
              ↓{plugin.download_count.toLocaleString("fr-FR")}
            </span>
          </div>
        </div>
      </button>
    </motion.div>
  )
}
