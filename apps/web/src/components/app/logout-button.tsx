"use client";

import { LuLogOut } from "react-icons/lu";
import { Confirm } from "@/components/app/confirm";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { clearOutboxes } from "@/lib/outbox";
import { useT } from "@/i18n/client";

/**
 * Asks first, so a stray tap doesn't end the session mid-task. Then a full page load, not a client
 * navigation: nothing from this session (a patient's details, a typed message) stays in the browser's memory.
 */
export function LogoutButton({ to }: { to: string }) {
  const staff = to.startsWith("/staff");
  // Patients see it in their language (NFR 7); staff screens are English.
  const { t } = useT();
  return (
    <Confirm
      trigger={
        <Button variant="ghost" size="compact" icon={<LuLogOut />}>
          {staff ? "Log out" : t.logout.button}
        </Button>
      }
      title={staff ? "Log out?" : t.logout.title}
      description={
        staff
          ? "To come back you'll need your password and a new code from your email."
          : t.logout.body
      }
      confirmLabel={staff ? "Log out" : t.logout.button}
      variant="primary"
      onConfirm={async () => {
        await api("/auth/logout", {}).catch(() => null);
        // FR 1.8: answers waiting for a connection don't stay on the device either.
        clearOutboxes();
        window.location.replace(to);
      }}
    />
  );
}
