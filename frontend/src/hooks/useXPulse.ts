import { useEffect, useRef, useCallback } from "react";
import { getToken, tryRefresh } from "../api";

type XPulseHandler = (data: Record<string, unknown>) => void;

export function useXPulse(onEvent: XPulseHandler, enabled = true) {
  const esRef = useRef<EventSource | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(async () => {
    if (!enabled) return;

    // Always try to get a fresh token before connecting
    let token = getToken();
    if (!token) return;

    // Attempt a refresh — if the access token is stale, this gets a new one
    const refreshed = await tryRefresh();
    if (refreshed) token = refreshed;

    token = getToken();
    if (!token) return;

    // Close any existing connection
    esRef.current?.close();
    esRef.current = null;

    const channels = ["notification", "broadcast"];
    const params = new URLSearchParams();
    channels.forEach((c) => params.append("channels", c));
    params.set("access_token", token);

    const url = `/app/xpulse/stream?${params}`;
    const es = new EventSource(url);
    esRef.current = es;

    const handle = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        handlerRef.current(data);
      } catch {
        /* ignore malformed */
      }
    };

    channels.forEach((ch) => es.addEventListener(ch, handle));
    es.addEventListener("message", handle);

    es.onerror = () => {
      es.close();
      esRef.current = null;
      // Reconnect after 5s — connect() will refresh the token first
      retryTimer.current = setTimeout(connect, 5000);
    };
  }, [enabled]);

  useEffect(() => {
    connect();
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [connect]);
}
