import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { cancelPrescription, formatPrescriptionCode } from "@ubuzima/shared";
import type { Request } from "express";
import { parse } from "../common/zod";
import { Auth, CurrentSession } from "../auth/guard";
import type { LiveSession } from "../auth/session.service";
import { PrescriptionsService } from "./prescriptions.service";

/** The prescriptions an agent or clinician has issued, at any time, and cancelling their own. */
@Controller("prescriptions")
@Auth({ kind: "staff", roles: ["AGENT", "CLINICIAN"] })
export class PrescriptionsController {
  constructor(private prescriptions: PrescriptionsService) {}

  @Get("mine")
  mine(@CurrentSession() session: LiveSession) {
    return this.prescriptions.mine(session.staffId!);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @CurrentSession() session: LiveSession,
    @Req() request: Request,
  ) {
    const { reason } = parse(cancelPrescription, body);
    return this.prescriptions.cancel(id, session.staffId!, reason, request.ip);
  }
}

/** The public check page for pharmacies. No login. */
@Controller("public/prescriptions")
export class PrescriptionCheckController {
  constructor(private prescriptions: PrescriptionsService) {}

  @Get(":code")
  check(@Param("code") code: string, @Req() request: Request) {
    return this.prescriptions.check(formatPrescriptionCode(code), request.ip);
  }
}
