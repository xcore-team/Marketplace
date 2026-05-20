import client from "@/lib/api/client"
import type { PluginRatingsSummary, Rating } from "@/types/rating"

const SERVICE_UNAVAILABLE_MESSAGE = "Service temporarily unavailable. Please try again later."

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeRatingsList(data: unknown): Rating[] {
  if (Array.isArray(data)) return data as Rating[]
  if (typeof data === "object" && data !== null) {
    const record = data as Record<string, unknown>
    if (Array.isArray(record.items)) return record.items as Rating[]
    if (Array.isArray(record.ratings)) return record.ratings as Rating[]
  }
  return []
}

function extractMyRating(data: unknown): number | null {
  if (typeof data === "object" && data !== null) {
    const record = data as Record<string, unknown>
    return (
      toNumber(record.score) ??
      toNumber(record.rating) ??
      toNumber(record.value) ??
      toNumber(record.stars)
    )
  }
  return null
}

// GET /app/marketplace/plugins/{slug}/ratings
export async function getPluginRatings(slug: string): Promise<Rating[]> {
  try {
    const res = await client.get(`/app/marketplace/plugins/${slug}/ratings`)
    return normalizeRatingsList(res.data)
  } catch {
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE)
  }
}

// GET /app/marketplace/plugins/{slug}/ratings/me
export async function getMyPluginRating(slug: string): Promise<number | null> {
  try {
    const res = await client.get(`/app/marketplace/plugins/${slug}/ratings/me`)
    return extractMyRating(res.data)
  } catch {
    return null
  }
}

export async function getPluginRatingsSummary(slug: string): Promise<PluginRatingsSummary> {
  const [ratings, myRating] = await Promise.all([
    getPluginRatings(slug).catch(() => []),
    getMyPluginRating(slug).catch(() => null),
  ])

  const scores = ratings
    .map((r) => toNumber((r as unknown as Record<string, unknown>).score) ?? toNumber((r as unknown as Record<string, unknown>).rating))
    .filter((s): s is number => s !== null)

  if (scores.length === 0) {
    return { average: null, count: 0, myRating }
  }

  const total = scores.reduce((acc, curr) => acc + curr, 0)
  return {
    average: total / scores.length,
    count: scores.length,
    myRating,
  }
}
