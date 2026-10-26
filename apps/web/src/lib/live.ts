"use client";

import { currentApp } from "@/lib/api";

import type { LiveEvent } from "@ubuzima/shared";
import { useEffect, useRef } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/**
 * Listens to a Server-Sent Events stream from the API (DECISIONS.md D34). The browser reconnects by itself
 * when the connection drops; `onReconnect` lets the screen fetch anything it missed meanwhile.
 */
export function useLive(path: string | null, onEvent: (e: LiveEvent) => void, onReconnect?: () => void) {
  const handler = useRef(onEvent);
  const reconnect = useRef(onReconnect);
  useEffect(() => {
    handler.current = onEvent;
    reconnect.current = onReconnect;
  });

  useEffect(() => {
    if (!path) return;
    const source = new EventSource(`${API}${path}${path.includes("?") ? "&" : "?"}as=${currentApp()}`, { withCredentials: true });
    let opened = false;
    source.onopen = () => {
      if (opened) reconnect.current?.();
      opened = true;
    };
    source.onmessage = (m) => {
      try {
        handler.current(JSON.parse(m.data) as LiveEvent);
      } catch {
        // pings and anything unexpected are ignored
      }
    };
    return () => source.close();
  }, [path]);
}
