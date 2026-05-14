// ─── Form Data ───────────────────────────────────────────────────────────
export type RegisterFormData = {
  fullName: string
  email: string
  password: string
}

export type LoginFormData = {
  email: string
  password: string
}

// ─── API Request/Response ─────────────────────────────────────────────────
export interface RegisterRequest {
  email: string
  password: string
  full_name: string
}

export interface AuthResponse {
  id: string
  email: string
  full_name: string
}

export interface AuthError {
  message: string
}

// ─── Field Errors ─────────────────────────────────────────────────────────
export type FieldErrors<T> = Partial<Record<keyof T, string | undefined>>