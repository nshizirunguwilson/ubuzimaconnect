import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { findByRef, verify } from "./verify";
import { photoSvg } from "./photo";

/** Outage switch for FR 1.5 ("verification unavailable"); also set with NIDA_OUTAGE=1. */
const state = { outage: process.env.NIDA_OUTAGE === "1" };

/**
 * Only listed addresses may call the identity service: the UbuzimaConnect API's outbound IPs
 * in production (NIDA_ALLOWED_IPS, comma-separated). Locally it defaults to this machine.
 * In Azure the same list is also set as App Service access restrictions, so other traffic
 * never reaches the app at all.
 */
const allowed = new Set(
  (process.env.NIDA_ALLOWED_IPS ?? "127.0.0.1,::1")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean),
);
const clean = (ip = "") => ip.replace(/^::ffff:/, "");

@Injectable()
class ApiKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!allowed.has(clean(req.ip))) throw new ForbiddenException();
    const key = process.env.NIDA_API_KEY ?? "dev-nida-key";
    if (req.header("x-api-key") !== key) throw new UnauthorizedException();
    if (state.outage && !req.path.endsWith("/outage")) throw new ServiceUnavailableException("Identity service is down");
    return true;
  }
}

@Controller()
class HealthController {
  @Get("health")
  health() {
    return { ok: true, outage: state.outage };
  }
}

@Controller("v1")
@UseGuards(ApiKeyGuard)
class NidaController {
  @Post("verify")
  @HttpCode(200)
  verify(@Body() body: { nationalId?: string; dateOfBirth?: string; name?: string }) {
    return verify(String(body.nationalId ?? ""), String(body.dateOfBirth ?? ""), String(body.name ?? ""));
  }

  @Get("photos/:ref")
  @Header("Content-Type", "image/svg+xml")
  @Header("Cache-Control", "private, max-age=86400")
  photo(@Param("ref") ref: string) {
    const c = findByRef(ref);
    if (!c) throw new NotFoundException();
    return photoSvg(c);
  }

  @Post("outage")
  @HttpCode(200)
  outage(@Body() body: { on?: boolean }) {
    state.outage = !!body.on;
    return { outage: state.outage };
  }
}

@Module({ controllers: [HealthController, NidaController], providers: [ApiKeyGuard] })
export class AppModule {}
