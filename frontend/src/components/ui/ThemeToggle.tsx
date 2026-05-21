"use client"

import { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { Sun, Moon } from "lucide-react"

export default function ThemeToggle() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )
  const { theme, setTheme } = useTheme()
  const isDark = theme === "dark"

  if (!mounted) {
    return <div className="w-9 h-9 rounded-xl border border-border bg-surface" />
  }

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="
        w-9 h-9
        flex items-center justify-center
        rounded-xl
        border border-border
        bg-surface
        text-foreground/60 hover:text-foreground
        hover:bg-foreground/5
        transition-all duration-200
        cursor-pointer
      "
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark
        ? <Sun  size={16} strokeWidth={1.8} />
        : <Moon size={16} strokeWidth={1.8} />
      }
    </button>
  )
}