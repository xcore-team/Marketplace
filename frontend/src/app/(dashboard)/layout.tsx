"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/lib/auth/authStore"
import Sidebar from "@/components/layout/Sidebar"

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { isAuthenticated } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login")
    }
  }, [isAuthenticated, router])

  if (!isAuthenticated) return null

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] bg-background overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pb-6">
        {children}
      </main>
    </div>
  )
}