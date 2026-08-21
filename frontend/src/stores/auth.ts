import { create } from 'zustand'
import { auth as authApi, setToken, teams as teamsApi } from '../api'
import type { User } from '../types'

interface AuthState {
  user: User | null
  loading: boolean
  initialized: boolean
  setUser: (u: User | null) => void
  initialize: () => Promise<void>
  logout: () => Promise<void>
  switchTeam: (tenantId: string) => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,

  setUser: (user) => set({ user }),

  initialize: async () => {
    set({ loading: true })
    try {
      const user = await authApi.me()
      set({ user, initialized: true })
    } catch {
      setToken(null)
      set({ user: null, initialized: true })
    } finally {
      set({ loading: false })
    }
  },

  logout: async () => {
    await authApi.logout()
    set({ user: null })
  },

  switchTeam: async (tenantId) => {
    const user = await teamsApi.select(tenantId)
    set({ user })
  },
}))
