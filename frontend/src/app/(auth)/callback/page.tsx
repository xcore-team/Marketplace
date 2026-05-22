"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuthStore } from "@/lib/auth/authStore"
import type { LoginResponse } from "@/types/auth"

function CallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setAuth, isAuthenticated } = useAuthStore()
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
    if (isAuthenticated) {
      router.replace("/dashboard/plugins")
    }
  }, [isAuthenticated, router])

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
