import { Injectable } from "@nestjs/common";
import { PRESCRIPTION_VALID_DAYS, prescriptionStatus, type PrescriptionInput } from "@ubuzima/shared";
import { randomInt } from "node:crypto";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";

/** Crockford base 32: no I, L, O or U, so a code read aloud or copied by hand is not misread. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const DAY_MS = 86_400_000;
/** A repeated code is astronomically rare. It is retried, but never more than a few times. */
const CODE_RETRIES = 3;
/** After this many unknown codes from one address within the window, checks from it pause. */
const MAX_UNKNOWN_CODES = 20;
const UNKNOWN_CODE_WINDOW_MS = 10 * 60_000;

/**
 * A new prescription code such as RX-7K3M-9QPD. 8 characters carry 40 random bits, about a trillion codes,
 * so guessing a valid one is impractical.
 */
function newCode() {
  const characters = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `RX-${characters.slice(0, 4)}-${characters.slice(4)}`;
}

/** What every prescription query loads with it. */
const include = {
  items: { orderBy: { position: "asc" as const } },
  prescriber: { select: { id: true, name: true, licenceNumber: true, role: true } },
};
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

/** Issuing, listing, cancelling and checking prescriptions. Who may do what is checked by the callers. */
@Injectable()
export class PrescriptionsService {
  constructor(
    private db: DbService,
    private audit: AuditService,
  ) {}

  /** Issues a prescription. No approval is needed; it gets a unique code and is valid for 7 days. */
  async issue(
    input: {
      patientId: string;
      caseId?: string;
      routingId?: string;
      prescriberId: string;
      ip?: string;
    } & PrescriptionInput,
  ) {
    // One moment for both, so "valid for 7 days" is exactly 7 days from the issue time.
    const issuedAt = new Date();
    for (let attempt = 0; ; attempt++) {
      try {
        const issued = await this.db.client.prescription.create({
          data: {
            createdAt: issuedAt,
            code: newCode(),
            patientId: input.patientId,
            caseId: input.caseId ?? null,
            routingId: input.routingId ?? null,
            prescriberId: input.prescriberId,
            validUntil: new Date(issuedAt.getTime() + PRESCRIPTION_VALID_DAYS * DAY_MS),
            items: { create: input.items.map((item, position) => ({ position, ...item })) },
          },
          include,
        });
        await this.audit.record(
          { type: "staff", id: input.prescriberId },
          "prescription.issued",
          { patientId: input.patientId, prescriptionId: issued.id, code: issued.code },
          input.ip,
        );
        return view(issued);
      } catch (error) {
        const codeAlreadyUsed = (error as { code?: string }).code === "P2002"; // Prisma's unique constraint error
        if (codeAlreadyUsed && attempt < CODE_RETRIES) continue;
        throw error;
      }
    }
  }

  /** Every prescription the patient has ever had, newest first. */
  async forPatient(patientId: string) {
    const list = await this.db.client.prescription.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      include,
    });
    return list.map(view);
  }

  /** Everything this person has issued, with each patient's name. */
  async mine(staffId: string) {
    const list = await this.db.client.prescription.findMany({
      where: { prescriberId: staffId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { ...include, patient: { select: { fullName: true } } },
    });
    return list.map((prescription) => ({ ...view(prescription), patient: prescription.patient.fullName }));
  }

  /** Cancels a prescription: only the person who issued it, and only while it is still valid. */
  async cancel(id: string, staffId: string, reason: string, ip?: string) {
    const prescription = await this.db.client.prescription.findUnique({ where: { id } });
    if (!prescription || prescription.prescriberId !== staffId) {
      throw new ApiException(403, "FORBIDDEN", "Only the person who issued a prescription can cancel it.");
    }
    if (prescriptionStatus(prescription) !== "VALID") {
      throw new ApiException(409, "CONFLICT", "This prescription has already expired or been cancelled.");
    }

    await this.db.client.prescription.update({
      where: { id },
      data: { cancelledAt: new Date(), cancelReason: reason },
    });
    await this.audit.record(
      { type: "staff", id: staffId },
      "prescription.cancelled",
      { patientId: prescription.patientId, prescriptionId: id, code: prescription.code },
      ip,
    );
    return { ok: true };
  }

  /**
   * The public check a pharmacy makes: what it needs and nothing more (no national ID, no diagnosis).
   * Every check is logged. After 20 unknown codes from one address in 10 minutes, checks from that address pause,
   * so codes can't be guessed in bulk.
   */
  async check(code: string, ip?: string) {
    const recentUnknownCodes = await this.db.client.auditEvent.count({
      where: {
        action: "prescription.checked",
        ip: ip ?? null,
        createdAt: { gte: new Date(Date.now() - UNKNOWN_CODE_WINDOW_MS) },
        detail: { path: ["found"], equals: false },
      },
    });
    if (recentUnknownCodes >= MAX_UNKNOWN_CODES) {
      throw new ApiException(429, "LOCKED", "Too many unknown codes. Wait 10 minutes and try again.");
    }

    const prescription = await this.db.client.prescription.findUnique({
      where: { code },
      include: { ...include, patient: { select: { fullName: true } } },
    });
    const detail = prescription
      ? { patientId: prescription.patientId, prescriptionId: prescription.id, code: prescription.code, found: true }
      : { found: false };
    await this.audit.record({ type: "anonymous" }, "prescription.checked", detail, ip);
    if (!prescription) return { found: false as const };

    const shown = view(prescription);
    return {
      found: true as const,
      code: shown.code,
      status: shown.status,
      patient: prescription.patient.fullName,
      items: shown.items,
      // Name and licence only: never internal IDs on a public page.
      prescriber: { name: shown.prescriber.name, licence: shown.prescriber.licence },
      issuedAt: shown.issuedAt,
      validUntil: shown.validUntil,
    };
  }
}

function view(prescription: Loaded) {
  return {
    id: prescription.id,
    code: prescription.code,
    status: prescriptionStatus(prescription),
    issuedAt: prescription.createdAt,
    validUntil: prescription.validUntil,
    cancelledAt: prescription.cancelledAt,
    cancelReason: prescription.cancelReason,
    items: prescription.items.map((item) => ({
      medicine: item.medicine,
      dose: item.dose,
      frequency: item.frequency,
      days: item.days,
      instructions: item.instructions,
    })),
    prescriber: {
      id: prescription.prescriber.id,
      name: prescription.prescriber.name,
      licence: prescription.prescriber.licenceNumber,
      role: prescription.prescriber.role,
    },
  };
}
