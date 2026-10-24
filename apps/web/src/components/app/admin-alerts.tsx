"use client";

import { toast } from "@/components/ui/toast";
import { useLive } from "@/lib/live";

/** FR 12.7, 6.10: an alert reaches the administrator on whatever staff page is open. */
export function AdminAlerts() {
  useLive("/events/staff", (e) => {
    if (e.type === "admin-alert") toast.error(e.text);
  });
  return null;
}
