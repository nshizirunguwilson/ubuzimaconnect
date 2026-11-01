import { CanActivate, createParamDecorator, ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { StaffRole } from "@ubuzima/shared";
import type { Request } from "express";
import { ApiException } from "../common/errors";
import { type LiveSession, SessionService } from "./session.service";

/** Who may call a route. */
type Requirement = { kind: "patient" } | { kind: "staff"; roles?: StaffRole[] } | { kind: "any" };

const REQUIREMENT_KEY = "auth:need";

/**
 * Put on a controller or a route, for example @Auth({ kind: "staff", roles: ["ADMIN"] }).
 * A route without it is public.
 */
export const Auth = (requirement: Requirement) => SetMetadata(REQUIREMENT_KEY, requirement);

type RequestWithSession = Request & { session?: LiveSession };

const forbidden = () => new ApiException(403, "FORBIDDEN", "You don't have access to this.");

/** Checks the session against the route's @Auth requirement, and hands the session to the route. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const requirement = this.reflector.getAllAndOverride<Requirement | undefined>(REQUIREMENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requirement) return true; // a public route

    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const session = await this.sessions.current(request, requirement.kind);

    if (!session || !session.verified) {
      // Someone logged in to the other app (a patient on a staff route, or the reverse) is told
      // they aren't allowed here, rather than being asked to log in.
      if (await this.loggedInToOtherApp(request, requirement)) throw forbidden();
      throw new ApiException(401, "UNAUTHENTICATED", "Your session has ended. Log in again.");
    }

    if (requirement.kind === "patient" && !session.patient) throw forbidden();

    if (requirement.kind === "staff") {
      const staff = session.staff;
      if (!staff || staff.status !== "ACTIVE") throw forbidden();
      if (requirement.roles && !requirement.roles.includes(staff.role)) throw forbidden();
    }

    request.session = session;
    return true;
  }

  private async loggedInToOtherApp(request: Request, requirement: Requirement) {
    if (requirement.kind === "any") return false;
    const otherApp = requirement.kind === "staff" ? "patient" : "staff";
    const otherSession = await this.sessions.current(request, otherApp);
    return otherSession?.verified === true;
  }
}

/** The session the guard checked, for use as a route parameter: @CurrentSession() session: LiveSession. */
export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => context.switchToHttp().getRequest<{ session: LiveSession }>().session,
);
