import type { StaffMe, StaffRole } from "@ubuzima/shared";
import { Suspense, type ReactNode } from "react";
import { requireRole } from "@/lib/session";

/** Wraps a client screen so only the listed roles can open it (checked on the server, FR 9). */
export function RolePage({ roles, children }: { roles: StaffRole[]; children: (me: StaffMe) => ReactNode }) {
  return (
    <Suspense>
      <Gate roles={roles}>{children}</Gate>
    </Suspense>
  );
}

async function Gate({ roles, children }: { roles: StaffRole[]; children: (me: StaffMe) => ReactNode }) {
  const me = await requireRole(...roles);
  return <>{children(me)}</>;
}
