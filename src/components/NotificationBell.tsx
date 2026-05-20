"use client";

import { Bell, BellOff } from "lucide-react";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";

/**
 * Simple bell icon + unread badge for use inside the sidebar nav.
 * Click behaviour is handled by the parent <Link> — this is display-only.
 */
export function NotificationBell({ collapsed }: { collapsed: boolean }) {
  const { unread, connected } = useAdminNotifications();

  const Icon = connected ? Bell : BellOff;

  return (
    <>
      {/* Icon + badge — always visible */}
      <span className="relative flex-shrink-0">
        <Icon
          className="flex-shrink-0"
          style={{
            width: 14,
            height: 14,
            color: connected ? "inherit" : "var(--signal-danger)",
            opacity: connected ? 0.6 : 0.8,
          }}
        />
        {unread > 0 && (
          <span
            className="absolute flex items-center justify-center rounded-full mono-value font-bold"
            style={{
              top: -4,
              right: -4,
              minWidth: 13,
              height: 13,
              padding: "0 2px",
              fontSize: 8,
              background: "var(--signal-danger)",
              color: "#fff",
              lineHeight: 1,
            }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </span>

      {/* Label + count badge — expanded only */}
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-[13px] text-left">Notifications</span>
          {unread > 0 && (
            <span
              className="mono-value font-bold flex-shrink-0 rounded-full"
              style={{
                fontSize: 9,
                padding: "1px 5px",
                background: "var(--signal-danger)",
                color: "#fff",
              }}
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </>
      )}
    </>
  );
}
