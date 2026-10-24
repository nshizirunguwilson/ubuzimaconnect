"use client";

import { useEffect } from "react";
import { toast } from "@/components/ui/toast";
import { useLive } from "@/lib/live";

/**
 * Keeps the agent's live stream open on every staff page, not only the queue, and shows alerts that arrive on it. The API counts an open
 * stream as "connected"; 60 seconds without one makes the agent Offline and returns their case (FR 6.14).
 *
 * Chrome may freeze a background tab after a few minutes, which would close the stream. Holding a Web Lock
 * is one of the conditions under which Chrome does not freeze a tab (DECISIONS.md D35).
 */
export function AgentPresence() {
  // FR 5.13: an alert stays on screen until dismissed, whichever staff page is open.
  useLive("/events/agent", (e) => {
    if (e.type === "alert") toast.error(e.text);
  });

  useEffect(() => {
    if (!("locks" in navigator)) return;
    const release = new AbortController();
    navigator.locks
      .request("ubuzima-agent-presence", { signal: release.signal }, () => new Promise<void>((resolve) => release.signal.addEventListener("abort", () => resolve())))
      .catch(() => null);
    return () => release.abort();
  }, []);

  return null;
}
