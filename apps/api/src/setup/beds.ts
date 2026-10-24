import type { Db } from "@ubuzima/db";

/**
 * FR 8.3: available beds = total − occupied − reserved.
 * Reserved = held reservations (FR 5.7). Occupied = reservations used on arrival (FR 7.5) and,
 * from batch 4, beds assigned during a visit, until discharge or transfer frees them (FR 7.10).
 */
export async function bedUsage(db: Db, facilityId: string) {
  const [reserved, occupied] = await Promise.all([
    db.bedReservation.count({ where: { facilityId, status: "HELD" } }),
    db.bedReservation.count({ where: { facilityId, status: "USED", routing: { status: "ARRIVED" } } }),
  ]);
  return { occupied, reserved };
}
