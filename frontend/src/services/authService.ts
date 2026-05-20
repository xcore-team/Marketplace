import type { RegisterFormData, LoginRequest, LoginResponse, AuthResponse, RegisterRequest } from "@/types/auth"

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "https://api.xcorehub.dev").replace(/\/+$/, "")

function extractApiErrorMessage(errorData: unknown): string | null {
  if (typeof errorData !== "object" || errorData === null) {
    return null
  }

  const detail = (errorData as { detail?: unknown }).detail
  if (Array.isArray(detail)) {
    return detail
      .map((err: unknown) => {
        if (typeof err === "object" && err !== null) {
          const e = err as { msg?: unknown; type?: unknown }
          return typeof e.msg === "string" ? e.msg : (typeof e.type === "string" ? e.type : null)
        }
        return null
      })
      .filter((msg): msg is string => typeof msg === "string")
      .join(", ")
  }

  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail
  }

  const message = (errorData as { message?: unknown }).message
  if (typeof message === "string" && message.trim().length > 0) {
    return message
  }

  return null
}


export async function register(data: RegisterFormData): Promise<AuthResponse> {
  const payload: RegisterRequest = {
    email: data.email,
    password: data.password,
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
    let errorMessage = `Registration failed (${res.status})`
    try {
      const errorData = await res.json()
      const extracted = extractApiErrorMessage(errorData)
      if (extracted) {
        errorMessage = extracted
      }
    } catch {
    }
    throw new Error(errorMessage)
  }

  return res.json() as Promise<AuthResponse>
}






export async function login(data: LoginRequest): Promise<LoginResponse> {
  const res = await fetch(`${API_URL}/app/auth/login`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    let errorMessage = `Login failed (${res.status})`
    try {
      const errorData = await res.json()
      const extracted = extractApiErrorMessage(errorData)
      if (extracted) {
        errorMessage = extracted
      }
    } catch {
      
    }
    throw new Error(errorMessage)
  }

  return res.json() as Promise<LoginResponse>
}
