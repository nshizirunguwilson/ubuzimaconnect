import { Controller, Get, Param, ParseUUIDPipe, Query, Req } from "@nestjs/common";
import { age } from "@ubuzima/shared";
import type { Request } from "express";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { ApiException } from "../common/errors";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { PrescriptionsService } from "../prescriptions/prescriptions.service";
import { activityRows, newestFirst } from "./activity";

const PAGE = 50;

/**
 * A patient's own records and activity, at any time. A parent also sees their children's.
 * A child of 16 or more logs in with their own ID card and sees only their own.
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
  async records(
    @Param("patientId", ParseUUIDPipe) patientId: string,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const person = await this.allowedPerson(session, patientId);
    const cases = await this.db.client.case.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      include: {
        routings: {
          where: { arrivedAt: { not: null } },
          orderBy: { arrivedAt: "asc" },
          include: {
            facility: { select: { name: true } },
            entries: { include: { author: { select: { name: true } } }, orderBy: { version: "desc" } },
          },
        },
      },
    });
    await this.audit.viewed({ type: "patient", id: session.patientId }, "records.viewed", { patientId }, request.ip);

    return {
      person: {
        id: person.id,
        name: person.fullName,
        dateOfBirth: person.dateOfBirth,
        age: age(person.dateOfBirth),
        sex: person.sex,
        district: person.district,
        photoUrl: person.photoUrl,
      },
      prescriptions: await this.prescriptions.forPatient(patientId),
      cases: cases.map((found) => ({
        id: found.id,
        code: found.code,
        createdAt: found.createdAt,
        status: found.status,
        outcome: found.outcome,
        closingNote: found.closingNote,
        description: found.description,
        visits: found.routings.map((visit) => ({
          id: visit.id,
          facility: visit.facility.name,
          status: visit.status,
          arrivedAt: visit.arrivedAt,
          endedAt: visit.endedAt,
          // The current version of each entry. Earlier versions are kept for the clinicians.
          entries: latestVersions(visit.entries).map((entry) => ({
            id: entry.id,
            diagnosis: entry.diagnosis,
            treatment: entry.treatment,
            notes: entry.notes,
            by: entry.author.name,
            at: entry.createdAt,
          })),
        })),
      })),
    };
  }

  /** Every action on the record, by anyone including the patient, newest first, a page at a time. */
  @Get(":patientId/activity")
  async activity(
    @Param("patientId", ParseUUIDPipe) patientId: string,
    @Query("before") before: string | undefined,
    @CurrentSession() session: LiveSession,
  ) {
    await this.allowedPerson(session, patientId);
    // One more than a page is loaded, to know whether there is a next page.
    const events = await newestFirst(this.db.client, { patientId }, before, PAGE + 1);
    const rows = await activityRows(this.db.client, events.slice(0, PAGE), session.patientId!);
    const hasNextPage = events.length > PAGE;
    return { rows, next: hasNextPage ? events[PAGE - 1].id : null };
  }

  /** The patient themself, or one of their children. Anyone else is refused. */
  private async allowedPerson(session: LiveSession, patientId: string) {
    const isSelf = session.patientId === patientId;
    const isTheirChild =
      !isSelf &&
      (await this.db.client.familyLink.findUnique({
        where: { guardianId_dependantId: { guardianId: session.patientId!, dependantId: patientId } },
      })) !== null;

    const person =
      isSelf || isTheirChild ? await this.db.client.patient.findUnique({ where: { id: patientId } }) : null;
    if (!person) throw new ApiException(403, "FORBIDDEN", "You can see only your own records and your children's.");
    return person;
  }
}

/**
 * The latest version of each entry, in the order the entries were first written.
 * The entries arrive newest version first, so the first one seen for each rootId is the latest.
 */
function latestVersions<T extends { rootId: string; createdAt: Date }>(entries: T[]) {
  const seenRoots = new Set<string>();
  const latest: T[] = [];
  for (const entry of entries) {
    if (seenRoots.has(entry.rootId)) continue;
    seenRoots.add(entry.rootId);
    latest.push(entry);
  }
  return latest.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
