import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { StaffRole } from "@ubuzima/shared";
import type { Request } from "express";
import { ApiException } from "../common/errors";
import { type LiveSession, SessionService } from "./session.service";

type Need = { kind: "patient" } | { kind: "staff"; roles?: StaffRole[] } | { kind: "any" };
const KEY = "auth:need";

/** @Auth({ kind: "staff", roles: ["ADMIN"] }) on a controller or route. Without it a route is public. */
export const Auth = (need: Need) => SetMetadata(KEY, need);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const need = this.reflector.getAllAndOverride<Need | undefined>(KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!need) return true;
    const req = ctx.switchToHttp().getRequest<Request & { session?: LiveSession }>();
    const s = await this.sessions.current(req);
    if (!s || !s.verified) throw new ApiException(401, "UNAUTHENTICATED", "Your session has ended. Log in again.");
    if (need.kind === "patient" && !s.patient) throw forbidden();
    if (need.kind === "staff") {
      if (!s.staff || s.staff.status !== "ACTIVE") throw forbidden();
      if (need.roles && !need.roles.includes(s.staff.role)) throw forbidden();
    }
    req.session = s;
    return true;
  }
}

const forbidden = () => new ApiException(403, "FORBIDDEN", "You don't have access to this.");

/** The session the guard checked. */
export const CurrentSession = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<{ session: LiveSession }>().session,
);
