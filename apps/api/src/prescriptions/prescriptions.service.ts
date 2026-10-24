import { Injectable } from "@nestjs/common";
import { PRESCRIPTION_VALID_DAYS, prescriptionStatus, type PrescriptionInput } from "@ubuzima/shared";
import { randomInt } from "node:crypto";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";

/** Crockford base 32: no I, L, O or U, so a code read aloud or copied by hand is not misread. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** 8 characters = 40 random bits: about a trillion codes, so guessing a valid one is impractical (FR 11.2, 11.7). */
const newCode = () => {
  const c = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `RX-${c.slice(0, 4)}-${c.slice(4)}`;
};
const DAY_MS = 86_400_000;

const include = { items: { orderBy: { position: "asc" as const } }, prescriber: { select: { id: true, name: true, licenceNumber: true, role: true } } };
type Loaded = {
  id: string;
  code: string;
  createdAt: Date;
  validUntil: Date;
  cancelledAt: Date | null;
  cancelReason: string | null;
  items: { medicine: string; dose: string; frequency: string; days: number; instructions: string | null }[];
  prescriber: { id: string; name: string; licenceNumber: string | null; role: string };
};

/** FR 11: issue, list, cancel and check prescriptions. Who may do what is checked by the callers. */
@Injectable()
export class PrescriptionsService {
  constructor(
    private db: DbService,
    private audit: AuditService,
  ) {}

  /** FR 11.1, 11.2: no approval; a unique code; valid for 7 days. */
  async issue(input: { patientId: string; caseId?: string; routingId?: string; prescriberId: string; ip?: string } & PrescriptionInput) {
    // One moment for both, so "valid for 7 days" is exactly 7 days from the issue time.
    const issuedAt = new Date();
    for (let attempt = 0; ; attempt++) {
      try {
        const p = await this.db.client.prescription.create({
          data: {
            createdAt: issuedAt,
            code: newCode(),
            patientId: input.patientId,
            caseId: input.caseId ?? null,
            routingId: input.routingId ?? null,
            prescriberId: input.prescriberId,
            validUntil: new Date(issuedAt.getTime() + PRESCRIPTION_VALID_DAYS * DAY_MS),
            items: { create: input.items.map((it, position) => ({ position, ...it })) },
          },
          include,
        });
        await this.audit.record({ type: "staff", id: input.prescriberId }, "prescription.issued", { patientId: input.patientId, prescriptionId: p.id, code: p.code }, input.ip);
        return view(p);
      } catch (e) {
        // A repeated code is astronomically rare; try a new one, never more than a few times.
        if (attempt < 3 && (e as { code?: string }).code === "P2002") continue;
        throw e;
      }
    }
  }

  /** FR 11.4, 11.6, 7.2: every prescription the patient ever had, newest first. */
  async forPatient(patientId: string) {
    const list = await this.db.client.prescription.findMany({ where: { patientId }, orderBy: { createdAt: "desc" }, include });
    return list.map(view);
  }

  /** FR 11.5: what this person issued, with the patient's name, at any time. */
  async mine(staffId: string) {
    const list = await this.db.client.prescription.findMany({
      where: { prescriberId: staffId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { ...include, patient: { select: { fullName: true } } },
    });
    return list.map((p) => ({ ...view(p), patient: p.patient.fullName }));
  }

  /** FR 11.3: only the prescriber, and only while it is still valid. */
  async cancel(id: string, staffId: string, reason: string, ip?: string) {
    const p = await this.db.client.prescription.findUnique({ where: { id } });
    if (!p || p.prescriberId !== staffId) throw new ApiException(403, "FORBIDDEN", "Only the person who issued a prescription can cancel it.");
    if (prescriptionStatus(p) !== "VALID") throw new ApiException(409, "CONFLICT", "This prescription has already expired or been cancelled.");
    await this.db.client.prescription.update({ where: { id }, data: { cancelledAt: new Date(), cancelReason: reason } });
    await this.audit.record({ type: "staff", id: staffId }, "prescription.cancelled", { patientId: p.patientId, prescriptionId: id, code: p.code }, ip);
    return { ok: true };
  }

  /**
   * FR 11.7: what a pharmacy needs, nothing more: no national ID, no diagnosis. Every check is logged.
   * After 20 unknown codes from one address in 10 minutes, checks from it pause, so codes can't be guessed in bulk.
   */
  async check(code: string, ip?: string) {
    const recentMisses = await this.db.client.auditEvent.count({
      where: { action: "prescription.checked", ip: ip ?? null, createdAt: { gte: new Date(Date.now() - 10 * 60_000) }, detail: { path: ["found"], equals: false } },
    });
    if (recentMisses >= 20) throw new ApiException(429, "LOCKED", "Too many unknown codes. Wait 10 minutes and try again.");
    const p = await this.db.client.prescription.findUnique({ where: { code }, include: { ...include, patient: { select: { fullName: true } } } });
    await this.audit.record({ type: "anonymous" }, "prescription.checked", p ? { patientId: p.patientId, prescriptionId: p.id, code: p.code, found: true } : { found: false }, ip);
    if (!p) return { found: false as const };
    const v = view(p);
    return {
      found: true as const,
      code: v.code,
      status: v.status,
      patient: p.patient.fullName,
      items: v.items,
      // Name and licence only: never internal IDs on a public page.
      prescriber: { name: v.prescriber.name, licence: v.prescriber.licence },
      issuedAt: v.issuedAt,
      validUntil: v.validUntil,
    };
  }
}

function view(p: Loaded) {
  return {
    id: p.id,
    code: p.code,
    status: prescriptionStatus(p),
    issuedAt: p.createdAt,
    validUntil: p.validUntil,
    cancelledAt: p.cancelledAt,
    cancelReason: p.cancelReason,
    items: p.items.map((i) => ({ medicine: i.medicine, dose: i.dose, frequency: i.frequency, days: i.days, instructions: i.instructions })),
    prescriber: { id: p.prescriber.id, name: p.prescriber.name, licence: p.prescriber.licenceNumber, role: p.prescriber.role },
  };
}
