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
import { nidaPersonInput, photoType } from "@ubuzima/shared";
import type { Request, Response } from "express";
import { photoSvg } from "./photo";
import { add, everyone, NidaInputError } from "./store";
import { findByRef, verify } from "./verify";

/** A switch to pretend the service is down, so the "verification unavailable" path can be tested. Also NIDA_OUTAGE=1. */
const state = { outage: process.env.NIDA_OUTAGE === "1" };

/**
 * Only listed addresses may call the identity service: the UbuzimaConnect API's outbound IPs
 * in production (NIDA_ALLOWED_IPS, comma-separated). Locally it defaults to this machine.
 * In Azure the same list is also set as App Service access restrictions, so other traffic
 * never reaches the app at all.
 */
const allowedAddresses = new Set(
  (process.env.NIDA_ALLOWED_IPS ?? "127.0.0.1,::1")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean),
);

/** "::ffff:1.2.3.4" (an IPv4 address written as IPv6) becomes "1.2.3.4". */
function plainAddress(address = "") {
  return address.replace(/^::ffff:/, "");
}

/** Every /v1 call must come from an allowed address, with the right API key. */
@Injectable()
class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();

    if (!allowedAddresses.has(plainAddress(request.ip))) {
      console.warn(`Refused a caller not on NIDA_ALLOWED_IPS: ${request.ip}`);
      throw new ForbiddenException();
    }

    const apiKey = process.env.NIDA_API_KEY ?? "dev-nida-key";
    if (request.header("x-api-key") !== apiKey) throw new UnauthorizedException();

    // While the outage switch is on, everything fails except the switch itself.
    if (state.outage && !request.path.endsWith("/outage")) {
      throw new ServiceUnavailableException("Identity service is down");
    }
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

  /** The uploaded photo for people added through the form, or a silhouette for everyone else. */
  @Get("photos/:ref")
  async photo(@Param("ref") ref: string, @Res() response: Response) {
    const citizen = await findByRef(ref);
    if (!citizen) throw new NotFoundException();

    response.setHeader("Cache-Control", "private, max-age=86400");
    if (citizen.photo && citizen.photoType) return response.type(citizen.photoType).send(citizen.photo);
    return response.type("image/svg+xml").send(photoSvg(citizen));
  }

  /** Everyone in the records, newest additions first, for the administrator's list and the choice of a parent. */
  @Get("people")
  async people() {
    const citizens = await everyone();
    return citizens.map((citizen) => ({
      ref: citizen.ref,
      nationalId: citizen.nationalId,
      names: citizen.names,
      dateOfBirth: citizen.dateOfBirth,
      sex: citizen.sex,
      district: citizen.district,
      parentRefs: citizen.parentRefs,
      hasPhoto: Boolean(citizen.photo),
      addedAt: citizen.addedAt,
    }));
  }

  /** Adds a made-up person. The rules are checked again here, whoever calls. */
  @Post("people")
  async addPerson(@Body() body: unknown) {
    const parsed = nidaPersonInput.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? "Check the details");
    const input = parsed.data;

    let photo: { bytes: Buffer; type: "image/jpeg" | "image/png" } | null = null;
    if (input.photo) {
      const bytes = Buffer.from(input.photo.slice(input.photo.indexOf(",") + 1), "base64");
      const type = photoType(bytes);
      if (!type) throw new BadRequestException("The photo isn't a real JPG or PNG file");
      photo = { bytes, type };
    }

    try {
      const citizen = await add(input, photo);
      return {
        ref: citizen.ref,
        nationalId: citizen.nationalId,
        names: citizen.names,
        dateOfBirth: citizen.dateOfBirth,
        sex: citizen.sex,
        district: citizen.district,
        parentRefs: citizen.parentRefs,
      };
    } catch (error) {
      if (error instanceof NidaInputError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Post("outage")
  @HttpCode(200)
  outage(@Body() body: { on?: boolean }) {
    state.outage = Boolean(body.on);
    return { outage: state.outage };
  }
}

@Module({ controllers: [HealthController, NidaController], providers: [ApiKeyGuard] })
export class AppModule {}
