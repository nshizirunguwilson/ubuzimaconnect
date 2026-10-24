import { Controller, Get, Param, ParseUUIDPipe, Query, Req } from "@nestjs/common";
import { age } from "@ubuzima/shared";
import type { Request } from "express";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { PrescriptionsService } from "../prescriptions/prescriptions.service";
import { activityRows } from "./activity";

const PAGE = 50;

/**
 * FR 7.2, 10.2, 9.1: a patient's own records and activity, at any time; a parent also their children's,
 * at any age (FR 1.3). A child of 16 or more with their own ID logs in and sees only their own.
 */
@Controller("records")
@Auth({ kind: "patient" })
export class RecordsController {
  constructor(
    private db: DbService,
    private prescriptions: PrescriptionsService,
    private audit: AuditService,
  ) {}

  @Get(":patientId")
  async records(@Param("patientId", ParseUUIDPipe) patientId: string, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const person = await this.allowed(s, patientId);
    const cases = await this.db.client.case.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      include: {
        routings: {
          where: { arrivedAt: { not: null } },
          orderBy: { arrivedAt: "asc" },
          include: { facility: { select: { name: true } }, entries: { include: { author: { select: { name: true } } }, orderBy: { version: "desc" } } },
        },
      },
    });
    await this.audit.viewed({ type: "patient", id: s.patientId }, "records.viewed", { patientId }, req.ip);
    return {
      person: { id: person.id, name: person.fullName, dateOfBirth: person.dateOfBirth, age: age(person.dateOfBirth), sex: person.sex, district: person.district, photoUrl: person.photoUrl },
      prescriptions: await this.prescriptions.forPatient(patientId),
      cases: cases.map((c) => ({
        id: c.id,
        code: c.code,
        createdAt: c.createdAt,
        status: c.status,
        outcome: c.outcome,
        closingNote: c.closingNote,
        description: c.description,
        visits: c.routings.map((r) => ({
          id: r.id,
          facility: r.facility.name,
          status: r.status,
          arrivedAt: r.arrivedAt,
          endedAt: r.endedAt,
          // The current version of each entry; earlier versions stay for the clinicians (FR 7.7)
          entries: latestVersions(r.entries).map((e) => ({ id: e.id, diagnosis: e.diagnosis, treatment: e.treatment, notes: e.notes, by: e.author.name, at: e.createdAt })),
        })),
      })),
    };
  }

  /** FR 10.2: every action on the record, by anyone including the patient, newest first. */
  @Get(":patientId/activity")
  async activity(@Param("patientId", ParseUUIDPipe) patientId: string, @Query("before") before: string | undefined, @CurrentSession() s: LiveSession) {
    await this.allowed(s, patientId);
    const events = await this.db.client.auditEvent.findMany({
      where: { patientId, ...(before ? { id: { lt: before } } : {}) },
      orderBy: { id: "desc" },
      take: PAGE + 1,
    });
    const rows = await activityRows(this.db.client, events.slice(0, PAGE), s.patientId!);
    return { rows, next: events.length > PAGE ? events[PAGE - 1].id : null };
  }

  private async allowed(s: LiveSession, patientId: string) {
    const ok =
      s.patientId === patientId ||
      !!(await this.db.client.familyLink.findUnique({ where: { guardianId_dependantId: { guardianId: s.patientId!, dependantId: patientId } } }));
    const p = ok ? await this.db.client.patient.findUnique({ where: { id: patientId } }) : null;
    if (!p) throw new ApiException(403, "FORBIDDEN", "You can see only your own records and your children's.");
    return p;
  }
}

/** Entries come newest version first; keep the first one seen of each, in the order they were written. */
function latestVersions<T extends { rootId: string; createdAt: Date }>(entries: T[]) {
  const seen = new Set<string>();
  return entries.filter((e) => !seen.has(e.rootId) && seen.add(e.rootId)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
