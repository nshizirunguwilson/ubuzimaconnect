import { Body, Controller, Get, HttpCode, Post, Put, Req, Res } from "@nestjs/common";
import { age, type Me } from "@ubuzima/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { parse } from "../common/zod";
import { Auth, CurrentSession } from "./guard";
import { appHint, type LiveSession, SessionService } from "./session.service";

/** Who is logged in, and logging out. */
@Controller("auth")
export class MeController {
  constructor(
    private db: DbService,
    private sessions: SessionService,
    private audit: AuditService,
  ) {}

  /** Why this app has no live session, so the web app can send the person to the right login screen. */
  @Get("session")
  async session(@Req() request: Request) {
    const state = await this.sessions.state(request, appHint(request) ?? "staff");
    return { state };
  }

  @Get("me")
  @Auth({ kind: "any" })
  async me(@CurrentSession() session: LiveSession): Promise<Me> {
    if (session.staff) {
      const { id, name, email, role, facility } = session.staff;
      return {
        kind: "staff",
        id,
        name,
        email,
        role,
        facility: facility && { id: facility.id, name: facility.name },
      };
    }

    const patient = session.patient!;
    const familyLinks = await this.db.client.familyLink.findMany({
      where: { guardianId: patient.id },
      include: { dependant: true },
      orderBy: { dependant: { dateOfBirth: "asc" } },
    });

    return {
      kind: "patient",
      id: patient.id,
      name: patient.fullName,
      firstName: patient.firstName,
      photoUrl: patient.photoUrl,
      district: patient.district,
      sharedDevice: session.sharedDevice,
      family: familyLinks.map(({ dependant: child, relation }) => ({
        id: child.id,
        name: child.fullName,
        relation,
        age: age(child.dateOfBirth).years,
        photoUrl: child.photoUrl,
      })),
    };
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const session = await this.sessions.current(request);
    // The app that asked logs out. Without a hint, the session found (staff first) is the one ended.
    const app = appHint(request) ?? (session?.staffId ? "staff" : "patient");
    await this.sessions.end(request, response, app);

    if (session) {
      const actor = { type: session.staff ? "staff" : "patient", id: session.staffId ?? session.patientId } as const;
      await this.audit.record(actor, "logout", undefined, request.ip);
    }
    return { ok: true };
  }
}

/** The language switch, saved on the patient's record. Staff screens are only in English, so nothing is saved for them. */
@Controller("me")
export class LangController {
  constructor(private db: DbService) {}

  @Put("lang")
  @HttpCode(204)
  @Auth({ kind: "any" })
  async setLang(@Body() body: unknown, @CurrentSession() session: LiveSession) {
    const { lang } = parse(z.object({ lang: z.enum(["en", "rw"]) }), body);
    if (session.patientId) {
      await this.db.client.patient.update({ where: { id: session.patientId }, data: { lang } });
    }
  }
}
