import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { cancelPrescription, formatPrescriptionCode } from "@ubuzima/shared";
import type { Request } from "express";
import { parse } from "../common/zod";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { PrescriptionsService } from "./prescriptions.service";

/** FR 11.3, 11.5: the prescriptions an agent or clinician issued, at any time, and cancelling their own. */
@Controller("prescriptions")
@Auth({ kind: "staff", roles: ["AGENT", "CLINICIAN"] })
export class PrescriptionsController {
  constructor(private prescriptions: PrescriptionsService) {}

  @Get("mine")
  mine(@CurrentSession() s: LiveSession) {
    return this.prescriptions.mine(s.staffId!);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@Param("id", ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentSession() s: LiveSession, @Req() req: Request) {
    const { reason } = parse(cancelPrescription, body);
    return this.prescriptions.cancel(id, s.staffId!, reason, req.ip);
  }
}

/** FR 11.7: the public check page for pharmacies. No login. */
@Controller("public/prescriptions")
export class PrescriptionCheckController {
  constructor(private prescriptions: PrescriptionsService) {}

  @Get(":code")
  check(@Param("code") code: string, @Req() req: Request) {
    return this.prescriptions.check(formatPrescriptionCode(code), req.ip);
  }
}
