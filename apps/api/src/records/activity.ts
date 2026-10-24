import { actionLabel, ROLE_LABEL, type StaffRole } from "@ubuzima/shared";
import type { Db } from "@ubuzima/db";

type Event = { id: string; actorType: string; actorId: string | null; action: string; detail: unknown; createdAt: Date };

/**
 * FR 10.2, 10.3: turns logged events into "when, who, what" rows. Names are looked up in two queries, not per row.
 * `self` is the patient reading their own list, shown as "You".
 */
export async function activityRows(db: Db, events: Event[], self?: string) {
  const ids = (type: string) => [...new Set(events.filter((e) => e.actorType === type && e.actorId).map((e) => e.actorId!))];
  const [staff, patients] = await Promise.all([
    db.staff.findMany({ where: { id: { in: ids("staff") } }, select: { id: true, name: true, role: true } }),
    db.patient.findMany({ where: { id: { in: ids("patient") } }, select: { id: true, fullName: true } }),
  ]);
  return events.map((e) => {
    const d = (e.detail ?? {}) as Record<string, unknown>;
    const st = staff.find((x) => x.id === e.actorId);
    const pt = patients.find((x) => x.id === e.actorId);
    const who =
      e.actorType === "staff" && st
        ? { name: st.name, role: ROLE_LABEL[st.role as StaffRole] }
        : e.actorType === "patient" && pt
          ? { name: pt.id === self ? "You" : pt.fullName, role: "Patient" }
          : e.actorType === "system"
            ? { name: "UbuzimaConnect", role: "Automatic" }
            : { name: e.action === "prescription.checked" ? "A pharmacy" : "Someone not logged in", role: null };
    return {
      id: e.id,
      at: e.createdAt,
      action: e.action,
      what: actionLabel(e.action) + (typeof d.code === "string" ? ` ${d.code}` : ""),
      label: actionLabel(e.action),
      code: typeof d.code === "string" ? d.code : null,
      who,
      // FR 10.1, 10.2: logins show the device type, never the full browser details
      device: typeof d.device === "string" ? d.device : null,
    };
  });
}
