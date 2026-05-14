"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Puzzle,
  Code2,
  ClipboardList,
  Users,
  Tag,
  ShieldAlert,
  Lock,
  Server,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { authApi } from "@/lib/admin-api";
import { getAdminSession, sessionExpiresIn } from "@/lib/admin-auth";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
  { href: "/plugins",     label: "Plugins",     icon: Puzzle },
  { href: "/developers",  label: "Developers",  icon: Code2 },
  { href: "/submissions", label: "Submissions", icon: ClipboardList },
  { href: "/users",       label: "Users",       icon: Users },
  { href: "/categories",  label: "Categories",  icon: Tag },
  { href: "/audit",       label: "Audit",       icon: ShieldAlert },
  { href: "/rbac",        label: "RBAC",        icon: Lock },
  { href: "/system",      label: "System",      icon: Server },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const session = getAdminSession();

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
      className="flex flex-col h-full transition-all duration-300"
      style={{
        width: collapsed ? "72px" : "240px",
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-4"
        style={{ borderBottom: "1px solid var(--border)", minHeight: "64px" }}
      >
        <div className="flex items-center justify-center w-8 h-8 flex-shrink-0">
          <Image
            src="/favicon.svg"
            alt="XCore"
            width={28}
            height={28}
            priority
          />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div
              className="font-display font-bold text-sm leading-tight"
              style={{ color: "var(--text-1)" }}
            >
              XCore Market
            </div>
            <div className="text-xs" style={{ color: "var(--xcore)" }}>
              Admin Panel
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="ml-auto flex-shrink-0 rounded-md p-1 transition-colors hover:text-[var(--text-1)]"
          style={{ color: "var(--text-3)" }}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed
            ? <ChevronRight className="w-4 h-4" />
            : <ChevronLeft  className="w-4 h-4" />}
        </button>
      </div>

      {/* Session indicator */}
      {!collapsed && (
        <div
          className="flex items-center gap-2 px-4 py-2 text-xs"
          style={{ borderBottom: "1px solid var(--border)", color: "var(--text-3)" }}
        >
          <span className="live-dot" />
          Session · {sessionExpiresIn()}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`admin-nav-link${active ? " active" : ""}`}
              title={collapsed ? label : undefined}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span className="flex-1 truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User + logout */}
      <div style={{ borderTop: "1px solid var(--border)" }} className="p-2">
        {!collapsed && session && (
          <div className="px-3 py-2 mb-1">
            <div
              className="text-xs font-medium truncate"
              style={{ color: "var(--text-1)" }}
            >
              {session.email}
            </div>
            <div className="text-xs mono-value mt-0.5" style={{ color: "var(--xcore)" }}>
              {session.roles[0] ?? "user"}
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="admin-nav-link w-full text-left"
          title={collapsed ? "Sign out" : undefined}
          style={{ color: "var(--text-3)" }}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
