"use client"

import Link from "next/link"
import ThemeToggle from "@/components/ui/ThemeToggle"
import { Menu, X } from "lucide-react"
import useUIStore from "@/lib/ui/uiStore"

export default function Navbar() {
  const { isSidebarOpen, toggleSidebar } = useUIStore()

  return (
    <header
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      className="
        fixed top-0 left-0 right-0 z-50
        h-14
        flex items-center justify-between
        px-4 md:px-6
        border-b border-border
        bg-background/80
        backdrop-blur-md
      "
    >
      <div className="flex items-center gap-3">
        {/* Mobile: hamburger */}
        <button
          onClick={toggleSidebar}
          className="md:hidden p-2 rounded-md text-foreground/60 hover:text-foreground"
          aria-label="Toggle menu"
        >
          {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        <Link
          href="/"
          className="text-sm font-semibold text-foreground tracking-tight"
        >
          XCore Marketplace
        </Link>
      </div>

      <ThemeToggle />

    </header>
  )
}