'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/routing'
import { Download, Star, Shield, TrendingUp, ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export interface Plugin {
  id: string
  name: string
  slug: string
  description: string
  version: string
  author: string
  downloads: number
  rating: number
  category: string
  trustLevel: 'sandboxed' | 'verified' | 'trusted' | 'core'
  trending?: boolean
  featured?: boolean
}

interface PluginCardProps {
  plugin: Plugin
}

const trustLevelConfig = {
  sandboxed: {
    color: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    label: 'Sandboxed',
  },
  verified: {
    color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    label: 'Verified',
  },
  trusted: {
    color: 'bg-xcore-green/10 text-xcore-green border-xcore-green/20',
    label: 'Trusted',
  },
  core: {
    color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    label: 'Core',
  },
}

export function PluginCard({ plugin }: PluginCardProps) {
  const t = useTranslations()
  const trustConfig = trustLevelConfig[plugin.trustLevel]

  return (
    <Link href={`/plugins/${plugin.slug}`}>
      <Card className="group relative h-full overflow-hidden border-xcore-border bg-xcore-card/50 backdrop-blur-sm hover:border-xcore-green/50 transition-all duration-300 cursor-pointer">
        {/* Hover Glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-xcore-green/0 via-xcore-green/0 to-xcore-green/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {/* Trending Badge */}
        {plugin.trending && (
          <div className="absolute top-4 right-4 z-10">
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-xcore-green/20 border border-xcore-green/30 backdrop-blur-sm">
              <TrendingUp className="w-3 h-3 text-xcore-green" />
              <span className="text-xs font-medium text-xcore-green">Trending</span>
            </div>
          </div>
        )}

        <div className="relative p-6 space-y-4">
          {/* Header */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-xl font-bold font-syne group-hover:text-xcore-green transition-colors line-clamp-1">
                {plugin.name}
              </h3>
              <ArrowRight className="w-5 h-5 text-xcore-muted group-hover:text-xcore-green group-hover:translate-x-1 transition-all flex-shrink-0" />
            </div>
            
            <p className="text-sm text-xcore-muted line-clamp-2 leading-relaxed">
              {plugin.description}
            </p>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={trustConfig.color}>
              <Shield className="w-3 h-3 mr-1" />
              {trustConfig.label}
            </Badge>
            <Badge variant="outline" className="border-xcore-border text-xcore-muted">
              {plugin.category}
            </Badge>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between pt-4 border-t border-xcore-border">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-xcore-muted">
                <Download className="w-4 h-4" />
                <span className="font-medium">{(plugin.downloads / 1000).toFixed(1)}K</span>
              </div>
              <div className="flex items-center gap-1.5 text-xcore-muted">
                <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                <span className="font-medium">{plugin.rating.toFixed(1)}</span>
              </div>
            </div>
            <div className="text-xs text-xcore-muted font-mono">
              v{plugin.version}
            </div>
          </div>

          {/* Author */}
          <div className="text-xs text-xcore-muted">
            by <span className="text-xcore-text font-medium">{plugin.author}</span>
          </div>
        </div>
      </Card>
    </Link>
  )
}
