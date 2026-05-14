import type { RegisterFormData, LoginRequest, LoginResponse, AuthResponse, RegisterRequest } from "@/types/auth"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"


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
    let errorMessage = `Registration failed (${res.status})`
    try {
      const errorData = await res.json()
      if (errorData.detail && Array.isArray(errorData.detail)) {
        errorMessage = errorData.detail
          .map((err: any) => err.msg || err.type)
          .join(", ")
      } else if (errorData.message) {
        errorMessage = errorData.message
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
      if (errorData.detail && Array.isArray(errorData.detail)) {
        errorMessage = errorData.detail
          .map((err: any) => err.msg || err.type)
          .join(", ")
      } else if (errorData.message) {
        errorMessage = errorData.message
      }
    } catch {
      
    }
    throw new Error(errorMessage)
  }

  return res.json() as Promise<LoginResponse>
}
