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
import useUIStore from "@/lib/ui/uiStore"
import { X } from "lucide-react"

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

// ─── Component ────────────────────────────────────────────────────────────

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()
  const { logout } = useAuthStore()
  const { isSidebarOpen, setSidebarOpen } = useUIStore()

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <div className="relative hidden md:block">
        <aside
          className={`
            flex flex-col h-screen
            bg-surface border-r border-border
            transition-all duration-300 ease-in-out
            ${collapsed ? "w-[60px]" : "w-[220px]"}
          `}
        >
          {/* Logo */}
          <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border overflow-hidden shrink-0">
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

          {/* Navigation + Notifications + Logout — tout dans le même flux */}
          <nav className="flex flex-col gap-1 p-2 overflow-y-auto overflow-x-hidden">
            {/* Nav items */}
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
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
                  )}
                  <Icon size={17} strokeWidth={isActive ? 2 : 1.8} className="shrink-0" />
                  <span className={`
                    text-sm font-medium whitespace-nowrap
                    transition-all duration-300
                    ${collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"}
                  `}>
                    {label}
                  </span>
                  {collapsed && (
                    <div className="
                      absolute left-full ml-3 px-2.5 py-1.5
                      bg-foreground text-background text-xs font-medium
                      rounded-lg whitespace-nowrap
                      opacity-0 group-hover:opacity-100
                      pointer-events-none transition-opacity duration-150 z-50
                    ">
                      {label}
                    </div>
                  )}
                </Link>
              )
            })}

            {/* Séparateur + Notifications + Logout — directement sous GitHub */}
            <div className="mt-6 flex flex-col gap-1">
              {/* Notifications */}
              {collapsed ? (
                <NotificationsPanel iconOnly />
              ) : (
                <NotificationsPanel />
              )}

              {/* Logout */}
              <button
                onClick={logout}
                className={`
                  relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
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
                {collapsed && (
                  <div className="
                    absolute left-full ml-3 px-2.5 py-1.5
                    bg-foreground text-background text-xs font-medium
                    rounded-lg whitespace-nowrap
                    opacity-0 group-hover:opacity-100
                    pointer-events-none transition-opacity duration-150 z-50
                  ">
                    Logout
                  </div>
                )}
              </button>
            </div>
          </nav>
        </aside>

        {/* Toggle collapse button */}
        <button
          onClick={() => setCollapsed(prev => !prev)}
          className="absolute -right-3 top-[68px] w-6 h-6 rounded-full bg-surface border border-border flex items-center justify-center text-foreground/40 hover:text-foreground transition-all duration-200 z-10"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronRight
            size={13}
            strokeWidth={2}
            className={`transition-transform duration-300 ${collapsed ? "" : "rotate-180"}`}
          />
        </button>
      </div>

      {/* ── Mobile off-canvas sidebar ── */}
      <div
        className="md:hidden fixed inset-0 z-50 pointer-events-none"
        aria-hidden={!isSidebarOpen}
      >
        {/* Backdrop */}
        <div
          onClick={() => setSidebarOpen(false)}
          className={`
            absolute inset-0 bg-black/40 transition-opacity
            ${isSidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0"}
          `}
        />

        {/* Drawer */}
        <aside
          className={`
            absolute left-0 top-0 bottom-0
            bg-surface w-64 flex flex-col
            pointer-events-auto
            transform transition-transform duration-300
            ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="shrink-0 w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <Package size={14} className="text-white" strokeWidth={2} />
              </div>
              <span className="text-sm font-semibold text-foreground">Marketplace</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg text-foreground/50 hover:text-foreground hover:bg-foreground/5 transition-all duration-200"
              aria-label="Close menu"
            >
              <X size={17} />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex flex-col gap-1 p-2 flex-1 overflow-y-auto">
            {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
              const isActive = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    relative flex items-center gap-3 px-3 py-2.5 rounded-xl
                    transition-all duration-200
                    ${isActive
                      ? "bg-primary/10 text-primary"
                      : "text-foreground/50 hover:text-foreground hover:bg-foreground/5"
                    }
                  `}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-full" />
                  )}
                  <Icon size={17} strokeWidth={isActive ? 2 : 1.8} className="shrink-0" />
                  <span className="text-sm font-medium">{label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Mobile bottom zone — Notifications + Logout */}
          <div className="flex flex-col border-t border-border p-2 shrink-0 gap-1">
            {/* Full notifications panel */}
            <NotificationsPanel />

            {/* Logout */}
            <button
              onClick={() => {
                logout()
                setSidebarOpen(false)
              }}
              className="
                w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                text-foreground/40 hover:text-red-400 hover:bg-red-400/8
                transition-all duration-200
              "
            >
              <LogOut size={17} strokeWidth={1.8} className="shrink-0" />
              <span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        </aside>
      </div>
    </>
  )
}