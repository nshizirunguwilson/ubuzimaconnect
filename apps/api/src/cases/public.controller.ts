import { Controller, Get, Query } from "@nestjs/common";
import { formatKm, matchFacilities } from "@ubuzima/shared";
import { FacilityDataService } from "./facilities.service";

/** FR 1.9, 9.6: no login. No case or record is created. */
@Controller("public")
export class PublicController {
  constructor(private facilities: FacilityDataService) {}

  /** The nearest active facility that offers emergency care and has a clinician on duty. */
  @Get("emergency")
  async emergency(@Query("lat") lat?: string, @Query("lng") lng?: string) {
    const at = { lat: Number(lat), lng: Number(lng) };
    if (!Number.isFinite(at.lat) || !Number.isFinite(at.lng) || at.lat > -0.9 || at.lat < -3 || at.lng < 28.7 || at.lng > 31) {
      return { facility: null };
    }
    const m = matchFacilities(await this.facilities.forMatching(), at, "EMERGENCY_CARE", false);
    if (m.kind !== "SUITABLE") return { facility: null };
    const f = m.facility;
    return { facility: { name: f.name, phone: f.phone, distance: formatKm(m.km), latitude: f.latitude, longitude: f.longitude } };
  }
}
