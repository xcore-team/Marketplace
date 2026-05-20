"use client"

import { useEffect, useState } from "react"
import { LayoutGrid, Plus, Package } from "lucide-react"
import Link from "next/link"
import Button from "@/components/ui/Button"
import PluginCard from "@/components/plugin/PluginCard"
import { getMyPlugins } from "@/services/pluginService"
import type { Plugin } from "@/types/plugin"

export default function MyPluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getMyPlugins()
      .then(setPlugins)
      .catch(() => setError("Unable to load your plugins right now"))
      .finally(() => setIsLoading(false))
  }, [])

  return (
    <div className="p-8 max-w-5xl mx-auto">

      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <LayoutGrid size={18} className="text-primary" strokeWidth={1.8} />
            <h1 className="text-xl font-semibold text-foreground">My Plugins</h1>
          </div>
          <p className="text-sm text-foreground/50">
            Manage your published and unpublished plugins
          </p>
        </div>
        <Link href="/dashboard/submit">
          <Button icon={Plus} size="sm">Submit Plugin</Button>
        </Link>
      </div>

      {/* États */}
      {isLoading && (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-foreground/5 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400 text-center py-12">{error}</p>
      )}

      {!isLoading && !error && plugins.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-foreground/5 flex items-center justify-center mb-4">
            <Package size={24} className="text-foreground/30" strokeWidth={1.5} />
          </div>
          <p className="text-foreground/60 font-medium mb-1">No plugins yet</p>
          <p className="text-sm text-foreground/35 mb-6">Submit your first plugin to get started</p>
          <Link href="/dashboard/submit">
            <Button icon={Plus} size="sm">Submit Plugin</Button>
          </Link>
        </div>
      )}

      {!isLoading && !error && plugins.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {plugins.map(plugin => (
            <PluginCard key={plugin.slug} plugin={plugin} />
          ))}
        </div>
      )}

    </div>
  )
}