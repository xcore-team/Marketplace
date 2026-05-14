import type { RegisterFormData, AuthResponse, RegisterRequest } from "@/types/auth"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

// ─── Register ─────────────────────────────────────────────────────────────

export async function register(data: RegisterFormData): Promise<AuthResponse> {
  const payload: RegisterRequest = {
    email: data.email,
    password: data.password,
    full_name: data.fullName,
  }

  const res = await fetch(`${API_URL}/app/auth/register`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    // Try to parse error from backend
    let errorMessage = `Registration failed (${res.status})`
    try {
      const errorData = await res.json()
      if (errorData.detail && Array.isArray(errorData.detail)) {
        // FastAPI validation error format
        errorMessage = errorData.detail
          .map((err: any) => err.msg || err.type)
          .join(", ")
      } else if (errorData.message) {
        errorMessage = errorData.message
      }
    } catch {
      // If JSON parse fails, use status message
    }
    throw new Error(errorMessage)
  }

  return res.json() as Promise<AuthResponse>
}

// ─── Login (prepared for Phase 2) ─────────────────────────────────────────

export async function login(email: string, password: string) {
  const res = await fetch(`${API_URL}/app/auth/login`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    throw new Error(`Login failed (${res.status})`)
  }

  return res.json()
}
