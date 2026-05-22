import client from "@/lib/api/client"
import type { Category, Plugin, PluginDocs, PublicPlugin, PublicPluginsResponse, RatingCreate, RatingOut } from "@/types/plugin"

const SERVICE_UNAVAILABLE_MESSAGE = "Service temporarily unavailable. Please try again later."

// GET /marketplace/plugins/me/plugins
// export async function getMyPlugins(): Promise<Plugin[]> {
//   try {
//     const res = await client.get("/app/marketplace/plugins/me/plugins")
//     return res.data
//   } catch {
//     throw new Error(SERVICE_UNAVAILABLE_MESSAGE)
//   }
// }

export async function getMyPlugins(): Promise<Plugin[]> {
  try {
    const res = await client.get("/app/marketplace/plugins/me/plugins")
    if (process.env.NODE_ENV !== "production") {
      console.log("RAW API RESPONSE:", JSON.stringify(res.data, null, 2))
    }
    // L'API retourne peut-être { items: [...] } au lieu d'un tableau direct
    return Array.isArray(res.data) ? res.data : (res.data.items ?? [])
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.log("API ERROR:", err)
    }
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE)
  }
}

// GET /app/marketplace/categories
export async function getCategories(): Promise<Category[]> {
  try {
    const res = await client.get("/app/marketplace/categories")
    return Array.isArray(res.data) ? res.data : (res.data.items ?? [])
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.log("API ERROR (categories):", err)
    }
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE)
  }
}

// GET /app/marketplace/plugins — public, no auth
export async function getPublishedPlugins(params?: {
  limit?: number
  offset?: number
  search?: string
  category_id?: string
  sort?: "newest" | "downloads" | "rating"
}): Promise<PublicPluginsResponse> {
  try {
    const res = await client.get("/app/marketplace/plugins", { params })
    return res.data
  } catch {
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE)
  }
}

// --- Ratings ------------------------------------------------------------------

// POST /app/marketplace/plugins/{slug}/ratings — requires auth
export async function ratePlugin(slug: string, data: RatingCreate): Promise<RatingOut> {
  const res = await client.post(`/app/marketplace/plugins/${slug}/ratings`, data)
  return res.data
}

// GET /app/marketplace/plugins/{slug}/ratings/me — requires auth
export async function getMyRating(slug: string): Promise<RatingOut | null> {
  try {
    const res = await client.get(`/app/marketplace/plugins/${slug}/ratings/me`)
    return res.data
  } catch {
    return null
  }
}

// GET /app/marketplace/plugins/{slug}/ratings — public
export async function listRatings(slug: string, params?: { limit?: number; offset?: number }) {
  const res = await client.get(`/app/marketplace/plugins/${slug}/ratings`, { params })
  return res.data
}

// GET /app/xdocs/plugins/{slug}/docs
// GET /app/xdocs/plugins/{slug}/versions/{version}/docs
export async function getPluginDocs(slug: string, version?: string): Promise<PluginDocs> {
  try {
    const endpoint = version
      ? `/app/xdocs/plugins/${slug}/versions/${version}/docs`
      : `/app/xdocs/plugins/${slug}/docs`

    const res = await client.get(endpoint)
    return res.data
  } catch {
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE)
  }
}