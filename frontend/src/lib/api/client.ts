// Client HTTP centralisé.
// Tous les services l'importent — jamais de fetch() direct dans les composants.

import axios from "axios"
import { useAuthStore } from "@/lib/auth/authStore"

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "https://api.xcorehub.dev").replace(/\/+$/, "")

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
})

// ─── Intercepteur requête : injecte le JWT automatiquement ────────────────
//
// Avant chaque requête, on lit le token depuis le store Zustand
// et on l'ajoute au header Authorization.
// Les services n'ont jamais à gérer le token eux-mêmes.
//
client.interceptors.request.use((config) => {
  // getState() = accès au store Zustand sans hook (hors composant React)
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ─── Intercepteur réponse : gère le 401 globalement ──────────────────────
//
// Si le backend répond 401 (token expiré ou invalide) :
// → on logout automatiquement + redirect vers /login
// Sans ça, chaque service devrait gérer le 401 manuellement.
//
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      // window.location car on est hors composant React (pas de useRouter)
      window.location.href = "/login"
    }
    return Promise.reject(error)
  }
)

export default client