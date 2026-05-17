"use client"



import { LayoutGrid, Plus, Package } from "lucide-react"
import Link from "next/link"
import Button from "@/components/ui/Button"
import PluginCard from "@/components/plugin/PluginCard"
import type { Plugin } from "@/types/plugin"

const MOCK_PLUGINS: Plugin[] = [
  {
    slug: "xauth-plugin",
    name: "XAuth Plugin",
    description: "Authentication middleware for xcore pipelines",
    version: "1.2.0",
    status: "published",
    category_slug: "security",
    created_at: "2026-04-10T10:00:00Z",
    updated_at: "2026-05-01T12:00:00Z",
  },
  {
    slug: "data-transformer",
    name: "Data Transformer",
    description: "Transform and normalize data streams in real-time",
    version: "0.9.1",
    status: "unpublished",
    category_slug: "data",
    created_at: "2026-05-05T08:00:00Z",
    updated_at: "2026-05-14T09:30:00Z",
  },
]

export default function MyPluginsPage() {
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
          <Button icon={Plus} size="sm">
            Submit Plugin
          </Button>
        </Link>
      </div>

  
      {MOCK_PLUGINS.length === 0 ? (
     
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-foreground/5 flex items-center justify-center mb-4">
            <Package size={24} className="text-foreground/30" strokeWidth={1.5} />
          </div>
          <p className="text-foreground/60 font-medium mb-1">No plugins yet</p>
          <p className="text-sm text-foreground/35 mb-6">
            Submit your first plugin to get started
          </p>
          <Link href="/dashboard/submit">
            <Button icon={Plus} size="sm">Submit Plugin</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {MOCK_PLUGINS.map((plugin) => (
            <PluginCard key={plugin.slug} plugin={plugin} />
          ))}
        </div>
      )}

    </div>
  )
}