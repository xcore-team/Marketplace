"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard, Puzzle, Code2, ClipboardList,
  Users, Tag, ShieldAlert, Lock, Server, LogOut,
  ChevronLeft, ChevronRight, UserPlus, Bell,
} from "lucide-react";
import { authApi } from "@/lib/admin-api";
import { getAdminSession, sessionExpiresIn } from "@/lib/admin-auth";
import { NotificationBell } from "@/components/NotificationBell";

interface NavItem { href: string; label: string; icon: React.ElementType; }

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",      label: "Dashboard",      icon: LayoutDashboard },
  { href: "/plugins",        label: "Plugins",        icon: Puzzle },
  { href: "/developers",     label: "Developers",     icon: Code2 },
  { href: "/submissions",    label: "Submissions",    icon: ClipboardList },
  { href: "/users",          label: "Users",          icon: Users },
  { href: "/categories",     label: "Categories",     icon: Tag },
  { href: "/invites",        label: "Invites",        icon: UserPlus },
  { href: "/audit",          label: "Audit",          icon: ShieldAlert },
  { href: "/rbac",           label: "RBAC",           icon: Lock },
  { href: "/system",         label: "System",         icon: Server },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [sessionLabel, setSessionLabel] = useState<string | null>(null);
  const session = getAdminSession();

  useEffect(() => {
    setSessionLabel(sessionExpiresIn());
    const id = setInterval(() => setSessionLabel(sessionExpiresIn()), 30_000);
    return () => clearInterval(id);
  }, []);

  const notifActive = pathname === "/notifications";

  async function handleLogout() {
    try {
      const { getCookie } = await import("@/lib/admin-auth");
      const refreshToken = getCookie("refresh_token");
      if (refreshToken) await authApi.logout(refreshToken);
    } catch { /* ignore */ }
    document.cookie = "admin_token=; path=/; max-age=0";
    document.cookie = "refresh_token=; path=/; max-age=0";
    window.location.href = "/login";
  }

  return (
    <aside
      className="flex flex-col h-full relative transition-all duration-200"
      style={{
        width: collapsed ? "58px" : "220px",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      {/* Pulse line */}
      <div
        className="absolute left-0 top-8 bottom-8 w-px"
        style={{
          background: "linear-gradient(180deg, transparent 0%, var(--xcore) 30%, var(--xcore) 70%, transparent 100%)",
          animation: "sidebar-pulse 3s ease-in-out infinite",
          opacity: 0.5,
        }}
      />

      {/* Header */}
      <div
        className="flex items-center"
        style={{
          borderBottom: "1px solid var(--border)",
          minHeight: "54px",
          padding: collapsed ? "0 8px" : "0 12px",
          gap: collapsed ? 0 : 8,
          overflow: "hidden",
        }}
      >
        <div className="flex items-center justify-center flex-shrink-0" style={{ width: 24, height: 24 }}>
          <Image src="/favicon.svg" alt="XCore" width={22} height={22} priority />
        </div>

        {!collapsed && (
          <div className="flex-1 min-w-0 overflow-hidden">
            <div
              className="font-display font-bold text-[13px] leading-tight truncate"
              style={{ color: "var(--text-1)", letterSpacing: "-0.02em" }}
            >
              XCore Market
            </div>
            <div
              className="text-[10px] font-mono mt-px"
              style={{ color: "var(--xcore)", opacity: 0.7, letterSpacing: "0.08em" }}
            >
              ADMIN
            </div>
          </div>
        )}

        <button
          onClick={() => setCollapsed(v => !v)}
          className="rounded transition-colors flex-shrink-0"
          style={{
            color: "var(--text-3)",
            marginLeft: collapsed ? "auto" : 0,
            padding: 4,
          }}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed
            ? <ChevronRight className="w-3.5 h-3.5" />
            : <ChevronLeft  className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Session strip */}
      {!collapsed && (
        <div
          className="flex items-center gap-2 px-4 py-1.5"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span className="live-dot" />
          <span className="text-[10px] font-mono" style={{ color: "var(--text-3)", letterSpacing: "0.04em" }}>
            {sessionLabel ?? ""}
          </span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">

        {/* Notifications — always visible, real navigation link */}
        <Link
          href="/notifications"
          className={`admin-nav-link${notifActive ? " active" : ""}`}
          title={collapsed ? "Notifications" : undefined}
        >
          <NotificationBell collapsed={collapsed} />
        </Link>

        <div style={{ height: 3, borderBottom: "1px solid var(--border)", margin: "4px 0 7px" }} />

        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`admin-nav-link${active ? " active" : ""}`}
              title={collapsed ? label : undefined}
            >
              <Icon
                className="flex-shrink-0"
                style={{
                  width: 14,
                  height: 14,
                  color: active ? "var(--xcore)" : "inherit",
                  opacity: active ? 1 : 0.6,
                }}
              />
              {!collapsed && (
                <span className="flex-1 truncate text-[13px]">{label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User + logout */}
      <div style={{ borderTop: "1px solid var(--border)" }} className="p-2">
        {!collapsed && session && (
          <div
            className="px-2 py-2 mb-1 rounded-md"
            style={{ background: "rgba(255,255,255,0.02)" }}
          >
            <div
              className="text-[12px] font-medium truncate"
              style={{ color: "var(--text-2)", letterSpacing: "-0.01em" }}
            >
              {session.email}
            </div>
            <div
              className="text-[10px] font-mono mt-0.5"
              style={{ color: "var(--xcore)", opacity: 0.65, letterSpacing: "0.08em" }}
            >
              {session.roles[0]?.toUpperCase() ?? "USER"}
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="admin-nav-link w-full text-left"
          title={collapsed ? "Sign out" : undefined}
          style={{ color: "var(--text-3)" }}
        >
          <LogOut style={{ width: 13, height: 13, opacity: 0.5, flexShrink: 0 }} />
          {!collapsed && <span className="text-[13px]">Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
