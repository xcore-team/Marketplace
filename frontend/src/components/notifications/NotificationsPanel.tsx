"use client"

import { useEffect, useMemo, useState } from "react"
import { Bell, Dot } from "lucide-react"
import { useAuthStore } from "@/lib/auth/authStore"

type StreamNotification = {
  channel?: string
  user_id?: string
  text?: string
}

type NotificationItem = {
  id: string
  text: string
  receivedAt: number
}

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "https://api.xcorehub.dev").replace(/\/+$/, "")
const MAX_ITEMS = 12

function parseSseChunk(chunk: string): Array<{ event?: string; data?: string }> {
  const blocks = chunk.split("\n\n")
  const events: Array<{ event?: string; data?: string }> = []

  for (const block of blocks) {
    const trimmed = block.trim()
    if (!trimmed) continue

    const lines = trimmed.split("\n")
    let eventName: string | undefined
    const dataLines: string[] = []

    for (const line of lines) {
      if (line.startsWith(":")) continue
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim()
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim())
      }
    }

    if (dataLines.length > 0) {
      events.push({ event: eventName, data: dataLines.join("\n") })
    }
  }

  return events
}

export default function NotificationsPanel() {
  const token = useAuthStore((s) => s.token)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasNotifications = items.length > 0

  const statusLabel = useMemo(() => {
    if (error) return "Disconnected"
    return isConnected ? "Live" : "Connecting"
  }, [error, isConnected])

  useEffect(() => {
    if (!isAuthenticated || !token) {
      return
    }

    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let controller: AbortController | null = null

    const connect = async () => {
      if (cancelled) return

      setError(null)
      setIsConnected(false)
      controller = new AbortController()

      try {
        const query = new URLSearchParams()
        query.append("channels", "notification")

        const response = await fetch(`${API_BASE_URL}/app/XPulse/stream?${query.toString()}`, {
          method: "GET",
          headers: {
            Accept: "text/event-stream",
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        })

        if (!response.ok || !response.body) {
          throw new Error(`SSE connection failed (${response.status})`)
        }

        setIsConnected(true)

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (!cancelled) {
          const { value, done } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          const segments = buffer.split("\n\n")
          buffer = segments.pop() ?? ""

          for (const segment of segments) {
            const parsed = parseSseChunk(segment)
            for (const evt of parsed) {
              if (!evt.data) continue
              if (evt.event && evt.event !== "notification") continue

              try {
                const payload = JSON.parse(evt.data) as StreamNotification
                if (!payload.text) continue

                setItems((prev) => {
                  const next: NotificationItem = {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                    text: payload.text as string,
                    receivedAt: Date.now(),
                  }
                  return [next, ...prev].slice(0, MAX_ITEMS)
                })
                setUnreadCount((prev) => prev + 1)
              } catch {
                // Ignore malformed events without breaking the stream.
              }
            }
          }
        }
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : "Unable to connect notifications"
        setError(message)
        setIsConnected(false)

        retryTimer = setTimeout(() => {
          void connect()
        }, 3000)
      }
    }

    void connect()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      if (controller) controller.abort()
    }
  }, [isAuthenticated, token])

  if (!isAuthenticated) return null

  return (
    <div className="mx-2 mb-2 rounded-xl border border-border bg-foreground/[0.02]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Bell size={14} className="text-foreground/60" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-primary text-[10px] leading-4 text-white text-center font-semibold">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          <span className="text-xs font-medium text-foreground/75">Notifications</span>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => setUnreadCount(0)}
              className="text-[10px] uppercase tracking-wider text-primary hover:text-primary/80 transition-colors"
            >
              Mark read
            </button>
          )}
          <span className={`text-[10px] uppercase tracking-wider ${error ? "text-red-400" : isConnected ? "text-emerald-400" : "text-foreground/40"}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="max-h-36 overflow-y-auto">
        {!hasNotifications ? (
          <p className="px-3 py-2.5 text-xs text-foreground/45">No notification yet.</p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id} className="px-2.5 py-2 border-b border-border/60 last:border-b-0">
                <div className="flex items-start gap-1.5">
                  <Dot size={16} className="mt-0.5 text-primary" />
                  <div className="min-w-0">
                    <p className="text-xs text-foreground/85 leading-relaxed break-words">{item.text}</p>
                    <p className="text-[10px] text-foreground/35 mt-1">
                      {new Date(item.receivedAt).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
