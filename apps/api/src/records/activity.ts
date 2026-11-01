import { actionLabel, ROLE_LABEL, type StaffRole } from "@ubuzima/shared";
import type { Db } from "@ubuzima/db";

type Event = {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  detail: unknown;
  createdAt: Date;
};
type Person = { name: string; role: string | null };

/**
 * Turns logged events into "when, who, what" rows. Names are looked up in two queries in total, not one per row.
 * `selfId` is the patient reading their own list, who is shown as "You".
 */
export async function activityRows(db: Db, events: Event[], selfId?: string) {
  const actorIds = (actorType: string) => {
    const ids = events.filter((event) => event.actorType === actorType && event.actorId).map((event) => event.actorId!);
    return [...new Set(ids)];
  };
  const [staff, patients] = await Promise.all([
    db.staff.findMany({ where: { id: { in: actorIds("staff") } }, select: { id: true, name: true, role: true } }),
    db.patient.findMany({ where: { id: { in: actorIds("patient") } }, select: { id: true, fullName: true } }),
  ]);

  /** Who did it, as the activity list names them. */
  function whoDid(event: Event): Person {
    if (event.actorType === "staff") {
      const member = staff.find((person) => person.id === event.actorId);
      if (member) return { name: member.name, role: ROLE_LABEL[member.role as StaffRole] };
    }
    if (event.actorType === "patient") {
      const patient = patients.find((person) => person.id === event.actorId);
      if (patient) return { name: patient.id === selfId ? "You" : patient.fullName, role: "Patient" };
    }
    if (event.actorType === "system") return { name: "UbuzimaConnect", role: "Automatic" };
    if (event.action === "prescription.checked") return { name: "A pharmacy", role: null };
    return { name: "Someone not logged in", role: null };
  }

  return events.map((event) => {
    const detail = (event.detail ?? {}) as Record<string, unknown>;
    const code = typeof detail.code === "string" ? detail.code : null;
    return {
      id: event.id,
      at: event.createdAt,
      action: event.action,
      what: actionLabel(event.action) + (code ? ` ${code}` : ""),
      label: actionLabel(event.action),
      code,
      who: whoDid(event),
      // Logins show the kind of device, never the full browser details.
      device: typeof detail.device === "string" ? detail.device : null,
    };
  });
}
