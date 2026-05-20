"use client";

import {
  createContext, useCallback, useContext,
  useEffect, useRef, useState,
} from "react";
import { xpulseApi, type XPulseMessage } from "@/lib/admin-api";

export interface AdminNotification {
  id: string;
  channel: string;
  event: string;
  text: string;
  href?: string;
  data: XPulseMessage;
  at: Date;
  read: boolean;
}

interface NotificationsCtx {
  items: AdminNotification[];
  unread: number;
  connected: boolean;
  markAllRead: () => void;
  reconnect: () => void;
}

const Ctx = createContext<NotificationsCtx>({
  items: [],
  unread: 0,
  connected: false,
  markAllRead: () => {},
  reconnect: () => {},
});

const MAX_ITEMS = 100;

function buildText(channel: string, data: XPulseMessage): string {
  const ev = data.event ?? channel;
  if (ev === "SUBMISSION_PIPELINE_DONE")
    return `Pipeline — ${data.plugin_name}@${data.plugin_version} → ${data.status}`;
  if (ev === "PLUGIN_PUBLISHED")
    return `Publié : ${data.plugin_name}@${data.plugin_version}`;
  if (ev === "PLUGIN_UNPUBLISHED")
    return `Dépublié : ${data.plugin_name}`;
  if (data.text) return String(data.text);
  return String(ev);
}

function buildHref(data: XPulseMessage): string | undefined {
  const ev = data.event ?? "";
  if (ev === "SUBMISSION_PIPELINE_DONE" && data.submission_id)
    return `/submissions`;
  if ((ev === "PLUGIN_PUBLISHED" || ev === "PLUGIN_UNPUBLISHED") && data.plugin_name)
    return `/plugins/${data.plugin_name}`;
  return undefined;
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [items,     setItems]     = useState<AdminNotification[]>([]);
  const [connected, setConnected] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  const connect = useCallback(() => {
    stopRef.current?.();
    setConnected(false);
    stopRef.current = xpulseApi.connect(
      ["admin", "broadcast"],
      (channel, data) => {
        setItems(prev => {
          const n: AdminNotification = {
            id: crypto.randomUUID(),
            channel,
            event: String(data.event ?? channel),
            text: buildText(channel, data),
            href: buildHref(data),
            data,
            at: new Date(),
            read: false,
          };
          return [n, ...prev].slice(0, MAX_ITEMS);
        });
      },
      () => setConnected(false),
      () => setConnected(true),
    );
  }, []);

  useEffect(() => {
    connect();
    return () => { stopRef.current?.(); };
  }, [connect]);

  const markAllRead = useCallback(() => {
    setItems(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const unread = items.filter(n => !n.read).length;

  return (
    <Ctx.Provider value={{ items, unread, connected, markAllRead, reconnect: connect }}>
      {children}
    </Ctx.Provider>
  );
}

export function useNotifications() {
  return useContext(Ctx);
}
