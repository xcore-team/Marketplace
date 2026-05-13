"use client"

import Link from "next/link"
import ThemeToggle from "@/components/ui/ThemeToggle"

export default function Navbar() {
  return (
    <header
      className="
        fixed top-0 left-0 right-0 z-50
        h-14
        flex items-center justify-between
        px-6
        border-b border-border
        bg-background/80
        backdrop-blur-md
      "
    >
      <Link
        href="/"
        className="text-sm font-semibold text-foreground tracking-tight"
      >
        Marketplace
      </Link>

      <ThemeToggle />

    </header>
  )
}