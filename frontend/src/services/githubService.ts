import client from "@/lib/api/client"
import type { GitHubAccount, GitHubRepo } from "@/types/github"

const SERVICE_UNAVAILABLE_MESSAGE = "Service temporarily unavailable. Please try again later."

// GET /marketplace/github/link
export async function getGitHubLink(): Promise<GitHubAccount | null> {
  try {
    const res = await client.get("/app/marketplace/github/link")
    return res.data
  } catch (error: unknown) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "response" in error &&
      typeof (error as { response?: { status?: number } }).response?.status === "number"
        ? (error as { response?: { status?: number } }).response?.status
        : undefined

    if (status === 404) {
      return null   // 404 = pas encore lié
    }

    throw new Error(SERVICE_UNAVAILABLE_MESSAGE)
  }
}

// POST /marketplace/github/link
export async function linkGitHub(access_token: string): Promise<GitHubAccount> {
  try {
    const res = await client.post("/app/marketplace/github/link", { access_token })
    return res.data
  } catch {
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE)
  }
}

// DELETE /marketplace/github/link
export async function unlinkGitHub(): Promise<void> {
  try {
    await client.delete("/app/marketplace/github/link")
  } catch {
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE)
  }
}

// GET /marketplace/github/repos
export async function getGitHubRepos(): Promise<GitHubRepo[]> {
  try {
    const res = await client.get("/app/marketplace/github/repos")
    return res.data
  } catch {
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE)
  }
}

// POST /marketplace/github/publish
export async function publishFromGitHub(payload: {
  full_name: string
  default_branch: string
  plugin_version: string
}): Promise<void> {
  try {
    await client.post("/app/marketplace/github/publish", payload)
  } catch {
    throw new Error(SERVICE_UNAVAILABLE_MESSAGE)
  }
}