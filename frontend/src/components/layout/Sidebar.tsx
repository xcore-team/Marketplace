"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutGrid,
  Upload,
  GitBranch,
  ClipboardList,
  ChevronRight,
  LogOut,
  Package,
} from "lucide-react"
import { useAuthStore } from "@/lib/auth/authStore"
import NotificationsPanel from "@/components/notifications/NotificationsPanel"

// ─── Navigation items ─────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    label: "My Plugins",
    href: "/dashboard/plugins",
    icon: LayoutGrid,
  },
  {
    label: "Submit Plugin",
    href: "/dashboard/submit",
    icon: Upload,
  },
  {
    label: "Submissions",
    href: "/dashboard/submissions",
    icon: ClipboardList,
  },
  {
    label: "GitHub",
    href: "/dashboard/github",
    icon: GitBranch,
  },
]

// ─── Composant ────────────────────────────────────────────────────────────

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const { user, logout } = useAuthStore()
  const displayName = user?.user?.full_name || user?.email || "Utilisateur"

  return (
    <aside
      className={`
        relative flex flex-col h-screen
        bg-surface border-r border-border
        transition-all duration-300 ease-in-out
        ${collapsed ? "w-[60px]" : "w-[220px]"}
      `}
    >
      {/* ── Logo ── */}
      <div className={`
        flex items-center gap-2.5 px-4 h-14 border-b border-border
        overflow-hidden shrink-0
      `}>
        <div className="shrink-0 w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
          <Package size={14} className="text-white" strokeWidth={2} />
        </div>
        <span className={`
          text-sm font-semibold text-foreground tracking-tight whitespace-nowrap
          transition-all duration-300
          ${collapsed ? "opacity-0 w-0" : "opacity-100 w-auto"}
        `}>
          Marketplace
        </span>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex flex-col gap-1 p-2 flex-1 overflow-hidden">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const isActive = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`
                relative flex items-center gap-3 px-3 py-2.5 rounded-xl
                transition-all duration-200 group
                ${isActive
                  ? "bg-primary/10 text-primary"
                  : "text-foreground/50 hover:text-foreground hover:bg-foreground/5"
                }
              `}
            >
              {/* Indicateur actif */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
              )}

              <Icon
                size={17}
                strokeWidth={isActive ? 2 : 1.8}
                className="shrink-0"
              />

              <span className={`
                text-sm font-medium whitespace-nowrap
                transition-all duration-300
                ${collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"}
              `}>
                {label}
              </span>

              {/* Tooltip quand collapsed */}
              {collapsed && (
                <div className="
                  absolute left-full ml-3 px-2.5 py-1.5
                  bg-foreground text-background text-xs font-medium
                  rounded-lg whitespace-nowrap
                  opacity-0 group-hover:opacity-100
                  pointer-events-none
                  transition-opacity duration-150
                  z-50
                ">
                  {label}
                </div>
              )}
            </Link>
          )
        })}
      </nav>

      {/* ── User + Logout ── */}
      <div className="border-t border-border p-2 shrink-0">
        {!collapsed && <NotificationsPanel />}

        {!collapsed && user && (
          <div className="px-3 py-2 mb-1">
            <p className="text-xs font-medium text-foreground truncate">
              {displayName}
            </p>
            <p className="text-xs text-foreground/40 truncate">
              {user.email || "-"}
            </p>
          </div>
        )}

        <button
          onClick={logout}
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
            text-foreground/40 hover:text-red-400 hover:bg-red-400/8
            transition-all duration-200 group
          `}
        >
          <LogOut size={17} strokeWidth={1.8} className="shrink-0" />
          <span className={`
            text-sm font-medium whitespace-nowrap
            transition-all duration-300
            ${collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"}
          `}>
            Logout
          </span>
        </button>
      </div>

      {/* ── Toggle collapse ── */}
      <button
        onClick={() => setCollapsed(prev => !prev)}
        className="
          absolute -right-3 top-[68px]
          w-6 h-6 rounded-full
          bg-surface border border-border
          flex items-center justify-center
          text-foreground/40 hover:text-foreground
          transition-all duration-200
          z-10
        "
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <ChevronRight
          size={13}
          strokeWidth={2}
          className={`transition-transform duration-300 ${collapsed ? "" : "rotate-180"}`}
        />
      </button>
    </aside>
  )
}