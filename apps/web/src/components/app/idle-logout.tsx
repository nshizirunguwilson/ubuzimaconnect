"use client";

import { LIMITS } from "@ubuzima/shared";
import { useEffect } from "react";
import { api } from "@/lib/api";

const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

/**
 * FR 1.7 and 2.5: the server ends a session after 15 idle minutes. This leaves the screen
 * at the same moment, so health details are not left showing on an unattended device.
 */
export function IdleLogout({ to }: { to: string }) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await api("/auth/logout", {}).catch(() => null);
        // A full page load clears everything this session showed (see LogoutButton).
        window.location.replace(`${to}?ended=1`);
      }, LIMITS.sessionIdleMinutes * 60_000);
    };
    reset();
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [to]);
  return null;
}
