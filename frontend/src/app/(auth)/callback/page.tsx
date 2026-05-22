"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuthStore } from "@/lib/auth/authStore"
import type { LoginResponse, AuthUser } from "@/types/auth"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.xcorehub.dev"

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setAuth, token } = useAuthStore()
  const [status, setStatus] = useState<"processing" | "error">("processing")

  useEffect(() => {
    const accessToken = searchParams.get("access_token")
    if (!accessToken) {
      setStatus("error")
      return
    }

    const authResponse: LoginResponse = {
      access_token: accessToken,
      token_type: searchParams.get("token_type") || "bearer",
      expires_in: Number(searchParams.get("expires_in")) || 3600,
    }

    setAuth(authResponse)
  }, [searchParams, setAuth])

  useEffect(() => {
    if (!token || status === "error") return

    async function fetchUser() {
      try {
        const res = await fetch(`${API_URL}/app/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()

        useAuthStore.setState((state) => {
          const user: AuthUser = {
            ...state.user!,
            email: data.email ?? state.user?.email ?? "",
            user: {
              email: data.email ?? state.user?.user?.email ?? "",
              full_name: data.display_name ?? data.email?.split("@")[0] ?? state.user?.user?.full_name,
            },
          }
          return { user }
        })
      } catch {
        // silent — token already stored, proceed anyway
      }

      router.replace("/dashboard/plugins")
    }

    fetchUser()
  }, [token, status, router])

  if (status === "error") {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
          <span className="text-red-400 text-xl">!</span>
        </div>
        <p className="text-sm text-foreground/50 text-center">
          Authentication failed. No token received.
        </p>
        <a
          href="/login"
          className="text-sm font-medium text-primary hover:opacity-80 transition-opacity"
        >
          Back to login
        </a>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 py-16">
      <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      <p className="text-sm text-foreground/50">
        Signing you in...
      </p>
    </div>
  )
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center gap-4 py-16">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  )
}
