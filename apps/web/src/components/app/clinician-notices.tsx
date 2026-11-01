"use client";

import { useRouter } from "next/navigation";
import { toast } from "@/components/ui/toast";
import { useLive } from "@/lib/live";

/**
 * Tells a clinician on any staff page that a patient was given or handed over to them.
 * The notice is also saved, so the Patients page marks the patient as new until it is opened.
 */
export function ClinicianNotices() {
  const router = useRouter();
  useLive("/events/staff", (event) => {
    if (event.type !== "notice") return;
    toast.success(
      event.kind === "HANDOVER" ? "A patient was handed over to you" : "A patient on the way is assigned to you",
    );
    router.refresh();
  });
  return null;
}
