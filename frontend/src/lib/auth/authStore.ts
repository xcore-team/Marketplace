import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { AuthUser, LoginResponse } from "@/types/auth"

function decodeJWT(token: string): AuthUser | null {
  try {
    const payload = token.split(".")[1]
    const decoded = JSON.parse(atob(payload))
    return decoded as AuthUser
  } catch {
    return null
  }
}


function isTokenExpired(exp: number): boolean {
  return Date.now() / 1000 > exp
}


interface AuthState {
  
  token: string | null      
  user: AuthUser | null     


  isAuthenticated: boolean 

  setAuth: (response: LoginResponse) => void

  logout: () => void


  hasRole: (role: string) => boolean

  hasPermission: (permission: string) => boolean
}


export const useAuthStore = create<AuthState>()(
  persist(

    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,


      setAuth: (response: LoginResponse) => {
        const user = decodeJWT(response.access_token)

        if (!user) {
          console.error("Failed to decode JWT")
          return
        }

        set({
          token: response.access_token,
          user,
          isAuthenticated: !isTokenExpired(user.exp),
        })
      },

      logout: () => {
        set({
          token: null,
          user: null,
          isAuthenticated: false,
        })
      },

      hasRole: (role: string) => {
        const { user } = get()
        return user?.roles.includes(role) ?? false
      },

      hasPermission: (permission: string) => {
        const { user } = get()
        return user?.permissions.includes(permission) ?? false
      },
    }),

    {
      name: "auth",
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

