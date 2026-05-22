"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import ThemeToggle from "@/components/ui/ThemeToggle"
import { Menu, X } from "lucide-react"
import useUIStore from "@/lib/ui/uiStore"
import { useAuthStore } from "@/lib/auth/authStore"

export default function Navbar() {
  const { isSidebarOpen, toggleSidebar } = useUIStore()
  const { isAuthenticated } = useAuthStore()
  const pathname = usePathname()
  const isDashboard = pathname.startsWith("/dashboard")

  return (
    <header
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      className="
        fixed top-0 left-0 right-0 z-50
        h-14 flex items-center justify-between
        px-4 md:px-6
        border-b border-border
        bg-background/80 backdrop-blur-md
      "
    >
      <div className="flex items-center gap-3">
        {/* Hamburger — dashboard mobile only */}
        {isDashboard && (
          <button
            onClick={toggleSidebar}
            className="md:hidden p-2 rounded-md text-foreground/60 hover:text-foreground"
            aria-label="Toggle menu"
          >
            {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        )}

        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="text-sm font-semibold text-foreground tracking-tight">
            XCore <span className="text-primary">Hub</span>
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-2">
        {isAuthenticated ? (
          <Link
            href="/dashboard/plugins"
            className="hidden sm:inline-flex text-xs font-medium text-foreground/50 hover:text-foreground transition-colors mr-1"
          >
            Dashboard →
          </Link>
        ) : (
          <>
            <Link
              href="/login"
              className="hidden sm:inline-flex px-3 py-1.5 text-xs font-medium text-foreground/55 hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center px-3 py-1.5 rounded-lg bg-primary text-background text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              Get Started
            </Link>
          </>
        )}
        <ThemeToggle />
      </div>
    </header>
  )
}
