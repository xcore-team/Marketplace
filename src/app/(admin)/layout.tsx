"use client";

import AdminSidebar from "@/components/admin-sidebar";
import { NotificationsProvider } from "@/contexts/NotificationsContext";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificationsProvider>
      <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
        <AdminSidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </NotificationsProvider>
  );
}
