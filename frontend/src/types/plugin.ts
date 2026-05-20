// Basé sur les schemas PluginOut et PluginVersionOut de l'API

export type PluginStatus = "published" | "unpublished" | "yanked" | "pending" | ""

export interface PluginVersion {
  version: string
  status: PluginStatus
  created_at: string
}

export interface Plugin {
  slug: string
  name: string
  description: string
  version: string          // version actuelle
  status: PluginStatus
  category_slug: string | null
  created_at: string
  updated_at: string
  versions?: PluginVersion[]
}

// Réponse paginée — PageOut[PluginOut] dans l'API
export interface PaginatedPlugins {
  items: Plugin[]
  total: number
  page: number
  size: number
}

// Category used by the marketplace
export interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  plugin_count: number
}

export interface PluginDocs {
  id: string
  plugin_id: string
  version: string
  readme: string
  integration: string
  contributor: Record<string, unknown>
  extracted_at: string
}