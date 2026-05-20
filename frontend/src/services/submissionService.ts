import client from "@/lib/api/client"
import type { Submission, SecurityReport } from "@/types/submission"

const SERVICE_UNAVAILABLE_MESSAGE = "Service temporarily unavailable. Please try again later."

// GET /marketplace/submissions
export async function getMySubmissions(): Promise<Submission[]> {
  try {
    const res = await client.get("/app/marketplace/submissions")
    return Array.isArray(res.data) ? res.data : (res.data.items ?? [])
  } catch {
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE)
  }
}

// GET /marketplace/submissions/{id}
export async function getSubmission(id: string): Promise<Submission> {
  try {
    const res = await client.get(`/app/marketplace/submissions/${id}`)
    return res.data
  } catch { 
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE)
  }
}

// GET /marketplace/submissions/{id}/report
export async function getSubmissionReport(id: string): Promise<SecurityReport> {
  try {
    const res = await client.get(`/app/marketplace/submissions/${id}/report`)
    return res.data
  } catch {
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE)
  }
}

// POST /marketplace/submissions — multipart/form-data
// POST /marketplace/submissions — multipart/form-data
export async function submitPlugin(
  file: File,
  pluginName: string,
  pluginVersion: string,
  categorySlug: string
): Promise<Submission> {
  try {
    const form = new FormData()
    form.append("file", file)
    form.append("plugin_name", pluginName)
    form.append("plugin_version", pluginVersion)
    form.append("category_slug", categorySlug)
    const res = await client.post("/app/marketplace/submissions", form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    return res.data
  } catch {
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE)
  }
}