import client from "@/lib/api/client"
import type { Plugin } from "@/types/plugin"

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
    console.log("RAW API RESPONSE:", JSON.stringify(res.data, null, 2))
    // L'API retourne peut-être { items: [...] } au lieu d'un tableau direct
    return Array.isArray(res.data) ? res.data : (res.data.items ?? [])
  } catch (err) {
    console.log("API ERROR:", err)
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE)
  }
}