import {
  BadRequestException,
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
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { nidaPersonInput, photoType } from "@ubuzima/shared";
import type { Response } from "express";
import { findByRef, verify } from "./verify";
import { add, everyone, NidaInputError } from "./store";
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
    if (!allowed.has(clean(req.ip))) {
      console.warn(`Refused a caller not on NIDA_ALLOWED_IPS: ${req.ip}`);
      throw new ForbiddenException();
    }
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
  async verify(@Body() body: { nationalId?: string; dateOfBirth?: string; name?: string }) {
    return verify(String(body.nationalId ?? ""), String(body.dateOfBirth ?? ""), String(body.name ?? ""));
  }

  /** FR 1.10: the uploaded photo for people added through the form (D73), a silhouette for everyone else. */
  @Get("photos/:ref")
  async photo(@Param("ref") ref: string, @Res() res: Response) {
    const c = await findByRef(ref);
    if (!c) throw new NotFoundException();
    res.setHeader("Cache-Control", "private, max-age=86400");
    if (c.photo && c.photoType) return res.type(c.photoType).send(c.photo);
    return res.type("image/svg+xml").send(photoSvg(c));
  }

  /** D73: everyone in the records, newest additions first, for the administrator's list and the choice of a parent. */
  @Get("people")
  async people() {
    return (await everyone()).map((c) => ({
      ref: c.ref,
      nationalId: c.nationalId,
      names: c.names,
      dateOfBirth: c.dateOfBirth,
      sex: c.sex,
      district: c.district,
      parentRefs: c.parentRefs,
      hasPhoto: !!c.photo,
      addedAt: c.addedAt,
    }));
  }

  /** D73: a new made-up person. The rules are checked again here, whoever calls. */
  @Post("people")
  async addPerson(@Body() body: unknown) {
    const r = nidaPersonInput.safeParse(body);
    if (!r.success) throw new BadRequestException(r.error.issues[0]?.message ?? "Check the details");
    let photo: { bytes: Buffer; type: "image/jpeg" | "image/png" } | null = null;
    if (r.data.photo) {
      const bytes = Buffer.from(r.data.photo.slice(r.data.photo.indexOf(",") + 1), "base64");
      const type = photoType(bytes);
      if (!type) throw new BadRequestException("The photo isn't a real JPG or PNG file");
      photo = { bytes, type };
    }
    try {
      const c = await add(r.data, photo);
      return { ref: c.ref, nationalId: c.nationalId, names: c.names, dateOfBirth: c.dateOfBirth, sex: c.sex, district: c.district, parentRefs: c.parentRefs };
    } catch (e) {
      if (e instanceof NidaInputError) throw new BadRequestException(e.message);
      throw e;
    }
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
