import { Injectable } from "@nestjs/common";
import { currentShift, type FacilityForMatch, type Service } from "@ubuzima/shared";
import { DbService } from "../common/db.service";

/** Loads facilities with what routing needs right now: free beds and specialties on duty this shift. */
@Injectable()
export class FacilityDataService {
  constructor(private db: DbService) {}

  async forMatching(): Promise<FacilityForMatch[]> {
    const { date, shift } = currentShift();
    const facilities = await this.db.client.facility.findMany();
    const onShift = await this.db.client.shiftAssignment.findMany({
      where: {
        date: new Date(`${date}T00:00:00Z`),
        shift,
        unavailable: false,
        staff: { role: "CLINICIAN", status: "ACTIVE", specialty: { not: null }, facilityId: { not: null } },
      },
      select: { staff: { select: { facilityId: true, specialty: true } } },
    });
    // Bed counts for every facility in two grouped queries, not two per facility (measured: docs/PERFORMANCE.md).
    const [held, used] = await Promise.all([
      this.db.client.bedReservation.groupBy({ by: ["facilityId"], where: { status: "HELD" }, _count: true }),
      this.db.client.bedReservation.groupBy({ by: ["facilityId"], where: { status: "USED", routing: { status: "ARRIVED" } }, _count: true }),
    ]);
    const n = (rows: { facilityId: string; _count: number }[], id: string) => rows.find((r) => r.facilityId === id)?._count ?? 0;
    return facilities.map((f) => ({
      id: f.id,
      name: f.name,
      active: f.active,
      services: f.services as Service[],
      latitude: f.latitude,
      longitude: f.longitude,
      phone: f.phone,
      // FR 8.3, the same rule as setup/beds.ts: free = total − occupied − reserved
      freeBeds: f.totalBeds - n(used, f.id) - n(held, f.id),
      onDuty: [...new Set(onShift.filter((s) => s.staff.facilityId === f.id).map((s) => s.staff.specialty as Service))],
    }));
  }
}
