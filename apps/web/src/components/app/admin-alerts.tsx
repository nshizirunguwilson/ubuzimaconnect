"use client";

import { toast } from "@/components/ui/toast";
import { useLive } from "@/lib/live";

/** An alert reaches the administrator on whatever staff page is open. */
export function AdminAlerts() {
  useLive("/events/staff", (event) => {
    if (event.type === "admin-alert") toast.error(event.text);
  });
  return null;
}
