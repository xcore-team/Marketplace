# Guide d'intégration Frontend — XCore Market

Ce document couvre tout ce dont le frontend a besoin pour s'intégrer avec l'API :
authentification SSO, gestion des tokens JWT, notifications temps réel (SSE), WebSocket,
et les appels marketplace courants.

---

## Table des matières

1. [Configuration de base](#1-configuration-de-base)
2. [Authentification](#2-authentification)
3. [Gestion des tokens JWT](#3-gestion-des-tokens-jwt)
4. [OAuth / SSO](#4-oauth--sso)
5. [Appels API authentifiés](#5-appels-api-authentifiés)
6. [Notifications temps réel — SSE (xpulse)](#6-notifications-temps-réel--sse-xpulse)
7. [WebSocket (xwebsocket)](#7-websocket-xwebsocket)
8. [Marketplace — flux principaux](#8-marketplace--flux-principaux)
9. [Gestion des erreurs](#9-gestion-des-erreurs)

---

## 1. Configuration de base

```ts
// config/api.ts
export const API_BASE = "http://localhost:8000"
export const APP_PREFIX = "/app"

export const ENDPOINTS = {
  auth:        `${API_BASE}${APP_PREFIX}/xauth`,
  marketplace: `${API_BASE}${APP_PREFIX}/marketplace`,
  xpulse:      `${API_BASE}${APP_PREFIX}/xpulse`,
  ws:          `ws://localhost:8000${APP_PREFIX}/marketplace/ws`,
}
```

---

## 2. Authentification

### Inscription

```ts
// POST /app/xauth/register
const register = async (email: string, password: string) => {
  const res = await fetch(`${ENDPOINTS.auth}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw await res.json()
  const { access_token, refresh_token } = await res.json()
  saveTokens(access_token, refresh_token)
}
```

### Connexion

```ts
// POST /app/xauth/login
const login = async (email: string, password: string) => {
  const res = await fetch(`${ENDPOINTS.auth}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw await res.json()
  const { access_token, refresh_token } = await res.json()
  saveTokens(access_token, refresh_token)
}
```

### Déconnexion

```ts
// POST /app/xauth/logout
const logout = async () => {
  await authFetch(`${ENDPOINTS.auth}/logout`, { method: "POST" })
  clearTokens()
}
```

### Profil utilisateur

```ts
// GET /app/xauth/me
const getMe = async () => {
  const res = await authFetch(`${ENDPOINTS.auth}/me`)
  return res.json()
  // { id, email, roles, permissions, tenants, ... }
}
```

---

## 3. Gestion des tokens JWT

Les tokens sont des JWT RS256. L'`access_token` expire rapidement (typiquement 15 min).
Le `refresh_token` permet d'en obtenir un nouveau sans reconnexion.

```ts
// lib/tokens.ts
const TOKEN_KEY   = "xcore_access"
const REFRESH_KEY = "xcore_refresh"

export const saveTokens = (access: string, refresh: string) => {
  localStorage.setItem(TOKEN_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export const getAccessToken  = () => localStorage.getItem(TOKEN_KEY)
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY)
export const clearTokens     = () => {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

// Rafraîchit l'access token automatiquement
export const refreshAccessToken = async (): Promise<string> => {
  const refresh_token = getRefreshToken()
  if (!refresh_token) throw new Error("Non authentifié")

  const res = await fetch(`${ENDPOINTS.auth}/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token }),
  })
  if (!res.ok) {
    clearTokens()
    throw new Error("Session expirée")
  }
  const { access_token, refresh_token: new_refresh } = await res.json()
  saveTokens(access_token, new_refresh)
  return access_token
}
```

### Intercepteur HTTP avec retry automatique

```ts
// lib/fetch.ts
export const authFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const token = getAccessToken()

  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })

  // Token expiré → on rafraîchit et on réessaie une fois
  if (res.status === 401) {
    try {
      const newToken = await refreshAccessToken()
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          "Authorization": `Bearer ${newToken}`,
          "Content-Type": "application/json",
        },
      })
    } catch {
      clearTokens()
      window.location.href = "/login"
      throw new Error("Session expirée")
    }
  }

  return res
}
```

---

## 4. OAuth / SSO

### Flux complet

```
1. Frontend → GET /app/xauth/oauth/{provider}/authorize
              Reçoit { authorization_url }

2. Frontend → Redirige l'utilisateur vers authorization_url (Google, GitHub, etc.)

3. Provider  → Callback → GET /app/xauth/oauth/{provider}/callback?code=...
               Reçoit { access_token, refresh_token }

4. Frontend → Stocke les tokens → utilisateur connecté
```

### Providers disponibles

| Provider | Identifiant |
|----------|------------|
| Google | `google` |
| GitHub | `github` |
| Discord | `discord` |
| Microsoft | `microsoft` |

### Implémentation

```ts
// Étape 1 — Obtenir l'URL d'autorisation
const startOAuth = async (provider: "google" | "github" | "discord" | "microsoft") => {
  const res = await fetch(`${ENDPOINTS.auth}/oauth/${provider}/authorize`)
  const { authorization_url } = await res.json()
  window.location.href = authorization_url
}

// Étape 2 — Gérer le callback (page dédiée /oauth/callback)
// L'API redirige vers votre frontend avec les tokens dans les query params
// OU l'API retourne les tokens directement si vous appelez le callback côté serveur

const handleOAuthCallback = async (provider: string, code: string) => {
  const res = await fetch(
    `${ENDPOINTS.auth}/oauth/${provider}/callback?code=${code}`
  )
  if (!res.ok) throw await res.json()
  const { access_token, refresh_token } = await res.json()
  saveTokens(access_token, refresh_token)
}

// Lier un provider à un compte existant
const linkProvider = async (provider: string, code: string) => {
  await authFetch(`${ENDPOINTS.auth}/oauth/${provider}/link`, {
    method: "POST",
    body: JSON.stringify({ code }),
  })
}
```

---

## 5. Appels API authentifiés

Tous les appels ci-dessous utilisent `authFetch` qui gère le token automatiquement.

### Lister les plugins publiés

```ts
const getPlugins = async (limit = 20, offset = 0) => {
  const res = await fetch(`${ENDPOINTS.marketplace}/plugins?limit=${limit}&offset=${offset}`)
  return res.json()
  // [{ id, name, slug, description, avg_rating, versions, categories, ... }]
}
```

### Détails d'un plugin + docs

```ts
const getPlugin = async (slug: string) => {
  const [plugin, docs] = await Promise.all([
    fetch(`${ENDPOINTS.marketplace}/plugins/${slug}`).then(r => r.json()),
    fetch(`${ENDPOINTS.marketplace}/plugins/${slug}/docs`).then(r => r.json()),
  ])
  return { ...plugin, docs }
  // docs: { readme, integration, contributor: { maintainers, license, ... } }
}
```

### Soumettre un plugin (ZIP)

```ts
const submitPlugin = async (file: File, name: string, version: string) => {
  const form = new FormData()
  form.append("file", file)           // ZIP max 10 MB
  form.append("plugin_name", name)
  form.append("plugin_version", version)

  const token = getAccessToken()
  const res = await fetch(`${ENDPOINTS.marketplace}/submissions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` },
    body: form,
    // Ne pas mettre Content-Type — le browser le gère pour multipart/form-data
  })
  if (!res.ok) throw await res.json()
  return res.json()
  // { id, status: "pending", plugin_name, plugin_version, ... }
}
```

### Suivre l'état d'une soumission (polling)

```ts
const pollSubmission = async (submissionId: string, onUpdate: (sub: any) => void) => {
  const interval = setInterval(async () => {
    const res = await authFetch(`${ENDPOINTS.marketplace}/submissions/${submissionId}`)
    const sub = await res.json()
    onUpdate(sub)
    if (["approved", "rejected", "manual_review", "failed"].includes(sub.status)) {
      clearInterval(interval)
    }
  }, 3000)
  return () => clearInterval(interval)  // retourne une fonction de cleanup
}
```

> **Préférer SSE au polling** — voir section 6.

### Soumettre depuis GitHub

```ts
// 1. Lier le compte GitHub (une fois)
const linkGitHub = async (accessToken: string) => {
  await authFetch(`${ENDPOINTS.marketplace}/github/link`, {
    method: "POST",
    body: JSON.stringify({ access_token: accessToken }),
  })
}

// 2. Publier depuis un repo
const publishFromGitHub = async (owner: string, repo: string, version: string, branch = "main") => {
  const res = await authFetch(`${ENDPOINTS.marketplace}/github/publish`, {
    method: "POST",
    body: JSON.stringify({
      repo_owner: owner,
      repo_name: repo,
      plugin_version: version,
      branch,
    }),
  })
  return res.json()  // { id, status: "pending", ... }
}
```

---

## 6. Notifications temps réel — SSE (xpulse)

xpulse expose un flux SSE par utilisateur. Chaque événement lié à vos soumissions
arrive en temps réel sans polling.

### Connexion SSE

```ts
// lib/sse.ts
let eventSource: EventSource | null = null

export const connectSSE = (onEvent: (event: any) => void) => {
  const token = getAccessToken()

  // Le token JWT est passé en query param car EventSource ne supporte pas les headers
  eventSource = new EventSource(
    `${ENDPOINTS.xpulse}/stream?token=${token}`
  )

  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      onEvent(data)
    } catch { /* ignorer les heartbeats */ }
  }

  eventSource.onerror = async () => {
    eventSource?.close()
    // Rafraîchit le token et reconnecte après 3s
    try {
      await refreshAccessToken()
      setTimeout(() => connectSSE(onEvent), 3000)
    } catch {
      clearTokens()
      window.location.href = "/login"
    }
  }

  return () => eventSource?.close()
}
```

### Événements reçus

| `event` | Déclencheur | Données utiles |
|---------|------------|----------------|
| `SUBMISSION_RECEIVED` | Soumission acceptée (202) | `submission_id`, `plugin_name` |
| `SUBMISSION_PIPELINE_DONE` | Pipeline terminé | `submission_id`, `status`, `anomaly_score` |
| `PLUGIN_PUBLISHED` | Plugin publié (broadcast) | `plugin_name`, `plugin_version` |
| `SUBMISSION_STATUS_CHANGED` | Admin force un statut | `submission_id`, `status` |

### Utilisation React

```tsx
// hooks/useSSE.ts
import { useEffect } from "react"
import { connectSSE } from "@/lib/sse"

export const useSSE = (onEvent: (event: any) => void) => {
  useEffect(() => {
    const disconnect = connectSSE(onEvent)
    return disconnect
  }, [])
}

// Dans un composant
const SubmissionTracker = ({ submissionId }: { submissionId: string }) => {
  const [status, setStatus] = useState("pending")

  useSSE((event) => {
    if (event.submission_id === submissionId) {
      setStatus(event.status)
    }
  })

  return <div>Statut : {status}</div>
}
```

---

## 7. WebSocket (xwebsocket)

Le WebSocket est utile pour les fonctionnalités bidirectionnelles en temps réel
(chat, collaboration, présence). Pour les notifications passives, préférer SSE.

### Canaux disponibles

| Canal | Usage |
|-------|-------|
| `user` | Messages privés à un utilisateur |
| `admin` | Flux réservé aux admins |
| `broadcast` | Messages à tous les utilisateurs connectés |
| `platform` | Événements système globaux |

### Connexion

```ts
// lib/ws.ts
let socket: WebSocket | null = null

export const connectWS = (
  channel: "user" | "admin" | "broadcast" | "platform",
  onMessage: (data: any) => void,
) => {
  const token = getAccessToken()
  socket = new WebSocket(`${ENDPOINTS.ws}/${channel}?token=${token}`)

  socket.onopen = () => {
    console.log(`[WS] Connecté au canal "${channel}"`)
  }

  socket.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data))
    } catch { /* ignorer */ }
  }

  socket.onclose = (e) => {
    if (!e.wasClean) {
      // Reconnexion automatique après 5s
      setTimeout(() => connectWS(channel, onMessage), 5000)
    }
  }

  return {
    send: (data: object) => socket?.send(JSON.stringify(data)),
    close: () => socket?.close(),
  }
}
```

### Utilisation React

```tsx
// hooks/useWebSocket.ts
import { useEffect, useRef } from "react"
import { connectWS } from "@/lib/ws"

export const useWebSocket = (
  channel: "user" | "admin" | "broadcast" | "platform",
  onMessage: (data: any) => void,
) => {
  const wsRef = useRef<ReturnType<typeof connectWS> | null>(null)

  useEffect(() => {
    wsRef.current = connectWS(channel, onMessage)
    return () => wsRef.current?.close()
  }, [channel])

  return {
    send: (data: object) => wsRef.current?.send(data),
  }
}
```

---

## 8. Marketplace — flux principaux

### Flux d'inscription développeur

```
1. register(email, password)  →  tokens sauvegardés
2. connectSSE(onEvent)        →  flux temps réel ouvert
3. submitPlugin(zip, ...)     →  { id: "sub_xxx", status: "pending" }
4. SSE reçoit SUBMISSION_PIPELINE_DONE → afficher résultat
```

### Flux connexion SSO

```
1. startOAuth("google")          →  redirect vers Google
2. Google callback               →  handleOAuthCallback("google", code)
3. tokens sauvegardés            →  utilisateur connecté
4. connectSSE(onEvent)           →  flux temps réel ouvert
```

### Flux complet soumission

```ts
const submitAndTrack = async (file: File, name: string, version: string) => {
  // 1. Soumettre
  const sub = await submitPlugin(file, name, version)

  // 2. Écouter les événements SSE (déjà connecté au montage)
  //    L'événement SUBMISSION_PIPELINE_DONE arrivera automatiquement

  // 3. Si besoin de voir le rapport complet après approbation
  const report = await authFetch(
    `${ENDPOINTS.marketplace}/submissions/${sub.id}/report`
  ).then(r => r.json())

  return { submission: sub, report }
}
```

---

## 9. Gestion des erreurs

### Format des erreurs API

```ts
// Toutes les erreurs suivent ce format :
interface APIError {
  detail: string       // message lisible
  // ou pour les erreurs de validation :
  detail: Array<{
    loc: string[]
    msg: string
    type: string
  }>
}
```

### Codes HTTP à gérer

| Code | Signification | Action |
|------|--------------|--------|
| `400` | Requête invalide | Afficher `detail` à l'utilisateur |
| `401` | Token expiré / invalide | Rafraîchir le token ou rediriger vers login |
| `403` | Permission insuffisante | Afficher un message d'accès refusé |
| `404` | Ressource introuvable | Afficher 404 |
| `409` | Conflit (ex: slug déjà pris) | Afficher `detail` |
| `410` | Version yankée | Informer que la version a été retirée |
| `422` | Validation Pydantic | Afficher les erreurs de champ |
| `429` | Rate limit dépassé (200 req/min) | Attendre et réessayer |
| `503` | Worker Celery indisponible | Réessayer dans quelques secondes |

### Wrapper global

```ts
export const apiCall = async <T>(fn: () => Promise<Response>): Promise<T> => {
  const res = await fn()
  if (res.ok) return res.json() as T

  const error = await res.json().catch(() => ({ detail: "Erreur inconnue" }))
  const message = Array.isArray(error.detail)
    ? error.detail.map((e: any) => e.msg).join(", ")
    : error.detail

  throw Object.assign(new Error(message), { status: res.status })
}

// Usage
const plugin = await apiCall<Plugin>(() =>
  fetch(`${ENDPOINTS.marketplace}/plugins/mon-plugin`)
)
```
