import type { Db } from "@ubuzima/db";

/**
 * Beds in use at a facility.
 * Reserved: held for a patient on their way.
 * Occupied: used on arrival, or assigned during a visit, until discharge or transfer frees them.
 */
export async function bedUsage(db: Db, facilityId: string) {
  const [reserved, occupied] = await Promise.all([
    db.bedReservation.count({ where: { facilityId, status: "HELD" } }),
    db.bedReservation.count({ where: { facilityId, status: "USED", routing: { status: "ARRIVED" } } }),
  ]);
  return { occupied, reserved };
}

/** Free beds at a facility: the total, minus occupied, minus reserved. */
export async function freeBeds(db: Db, facility: { id: string; totalBeds: number }) {
  const { occupied, reserved } = await bedUsage(db, facility.id);
  return facility.totalBeds - occupied - reserved;
}
