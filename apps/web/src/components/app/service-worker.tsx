"use client";

import { useEffect } from "react";
import { SW_URL } from "@/lib/push";

/**
 * Registers the service worker that makes the app installable and opens the emergency page without a
 * connection (NFR 8, FR 1.9). Only in a production build: in development the cache would serve old code.
 * Push notifications register the same worker themselves when they are turned on (lib/push.ts).
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => null);
  }, []);
  return null;
}
