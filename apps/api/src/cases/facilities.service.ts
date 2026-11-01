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
    // Bed counts for every facility in two grouped queries, rather than two queries per facility.
    const [heldBeds, usedBeds] = await Promise.all([
      this.db.client.bedReservation.groupBy({ by: ["facilityId"], where: { status: "HELD" }, _count: true }),
      this.db.client.bedReservation.groupBy({
        by: ["facilityId"],
        where: { status: "USED", routing: { status: "ARRIVED" } },
        _count: true,
      }),
    ]);
    const countFor = (rows: { facilityId: string; _count: number }[], facilityId: string) =>
      rows.find((row) => row.facilityId === facilityId)?._count ?? 0;

    return facilities.map((facility) => {
      const specialtiesOnDuty = onShift
        .filter((assignment) => assignment.staff.facilityId === facility.id)
        .map((assignment) => assignment.staff.specialty as Service);

      return {
        id: facility.id,
        name: facility.name,
        active: facility.active,
        services: facility.services as Service[],
        latitude: facility.latitude,
        longitude: facility.longitude,
        phone: facility.phone,
        // The same rule as setup/beds.ts: free beds = total, minus occupied, minus held for someone on the way.
        freeBeds: facility.totalBeds - countFor(usedBeds, facility.id) - countFor(heldBeds, facility.id),
        onDuty: [...new Set(specialtiesOnDuty)],
      };
    });
  }
}
