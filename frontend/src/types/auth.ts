// Formulaires 

export type RegisterFormData = {
  fullName: string
  email: string
  password: string
}

export type LoginFormData = {
  email: string
  password: string
}

//  Requêtes API 

export interface RegisterRequest {
  email: string
  password: string
  full_name: string
}

export interface LoginRequest {
  email: string
  password: string
}

//  Réponses API 

export interface AuthResponse {
  id: string
  email: string
  full_name: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  expires_in: number
}

//  JWT décodé 

export interface AuthUser {
  sub: string          // UUID de l'utilisateur
  email: string
  roles: string[]      // ["developer"] | ["admin"] | ...
  permissions: string[]  // ["submissions:write", "ratings:create", ...]
  user: {
    email: string
    full_name: string
  }
  exp: number          
}

//  Erreurs 

export interface AuthError {
  message: string
}

export type FieldErrors<T> = Partial<Record<keyof T, string | undefined>>