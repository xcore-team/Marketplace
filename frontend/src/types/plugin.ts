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

// --- Public marketplace (GET /app/marketplace/plugins) ------------------------

export interface PublicPluginVersion {
  id: string
  version: string
  anomaly_score: number
  is_stable: boolean
  is_yanked: boolean
  yanked_reason: string | null
  publish_status: string
  changelog: string | null
  merkle_root: string | null
  created_at: string
}

export interface PublicPlugin {
  id: string
  developer_id: string
  dev_mail?: string | null
  name: string
  slug: string
  description: string | null
  homepage: string | null
  repository: string | null
  is_published: boolean
  avg_rating: number
  rating_count: number
  download_count: number
  latest_version: string | null
  created_at: string
  versions: PublicPluginVersion[]
  categories: { id: string; name: string; slug: string; description: string | null }[]
}

export function developerNameFromEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const local = email.split("@")[0]
  return local
    .split(/[._-]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

export function developerDisplayName(
  devMail: string | null | undefined,
  currentUserEmail?: string | null,
  currentUserName?: string | null
): string | null {
  if (!devMail) return null
  if (currentUserEmail && currentUserName && devMail.toLowerCase() === currentUserEmail.toLowerCase()) {
    return currentUserName
  }
  return developerNameFromEmail(devMail)
}

export interface PublicPluginsResponse {
  items: PublicPlugin[]
  total: number
  limit: number
  offset: number
  has_more: boolean
}

// --- Ratings ------------------------------------------------------------------

export interface RatingCreate {
  score: number
  comment?: string | null
}

export interface RatingOut {
  id: string
  plugin_id: string
  user_id: string
  score: number
  comment: string | null
  reviewer_name: string | null
  created_at: string
  updated_at: string
}