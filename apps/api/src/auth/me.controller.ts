import { Body, Controller, Get, HttpCode, Post, Put, Req, Res } from "@nestjs/common";
import type { Me } from "@ubuzima/shared";
import type { Request, Response } from "express";
import { z } from "zod";
import { AuditService } from "../common/audit.service";
import { DbService } from "../common/db.service";
import { parse } from "../common/zod";
import { Auth, CurrentSession } from "./guard";
import { appHint, type LiveSession, SessionService } from "./session.service";

const age = (dob: Date) => {
  const now = new Date();
  let a = now.getUTCFullYear() - dob.getUTCFullYear();
  if (now.getUTCMonth() < dob.getUTCMonth() || (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate())) a--;
  return a;
};

@Controller("auth")
export class MeController {
  constructor(
    private db: DbService,
    private sessions: SessionService,
    private audit: AuditService,
  ) {}

  /** For the web app's redirect to the login page: why this app has no live session (see SessionService.state). */
  @Get("session")
  async session(@Req() req: Request) {
    return { state: await this.sessions.state(req, appHint(req) ?? "staff") };
  }

  @Get("me")
  @Auth({ kind: "any" })
  async me(@CurrentSession() s: LiveSession): Promise<Me> {
    if (s.staff) {
      const { id, name, email, role, facility } = s.staff;
      return { kind: "staff", id, name, email, role, facility: facility && { id: facility.id, name: facility.name } };
    }
    const p = s.patient!;
    const links = await this.db.client.familyLink.findMany({
      where: { guardianId: p.id },
      include: { dependant: true },
      orderBy: { dependant: { dateOfBirth: "asc" } },
    });
    return {
      kind: "patient",
      id: p.id,
      name: p.fullName,
      firstName: p.firstName,
      photoUrl: p.photoUrl,
      district: p.district,
      sharedDevice: s.sharedDevice,
      family: links.map(({ dependant: d, relation }) => ({
        id: d.id,
        name: d.fullName,
        relation,
        age: age(d.dateOfBirth),
        photoUrl: d.photoUrl,
      })),
    };
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const s = await this.sessions.current(req);
    // The app that asked logs out; without a hint, the session found (staff first) is the one ended.
    const app = appHint(req) ?? (s?.staffId ? "staff" : "patient");
    await this.sessions.end(req, res, app);
    if (s) await this.audit.record({ type: s.staff ? "staff" : "patient", id: s.staffId ?? s.patientId }, "logout", undefined, req.ip);
    return { ok: true };
  }
}

/** NFR 7: the language switch, saved on the patient's record. Staff screens are English, so nothing to save. */
@Controller("me")
export class LangController {
  constructor(private db: DbService) {}

  @Put("lang")
  @HttpCode(204)
  @Auth({ kind: "any" })
  async setLang(@Body() body: unknown, @CurrentSession() s: LiveSession) {
    const { lang } = parse(z.object({ lang: z.enum(["en", "rw"]) }), body);
    if (s.patientId) await this.db.client.patient.update({ where: { id: s.patientId }, data: { lang } });
  }
}
