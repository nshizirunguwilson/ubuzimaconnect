import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { json, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { env } from "./common/env";
import { stripForwardedPorts } from "./common/forwarded";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ["error", "warn", "log"] });
  // req.ip must be the visitor, not a proxy: the code-guessing pause and the logs use it (FR 11.7, NFR 9).
  // In production a patient's request passes Vercel's /api rewrite, then Azure's front end: 2 hops (D67).
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));
  app.use(stripForwardedPorts);
  app.use(helmet());
  app.use(cookieParser());
  // D73: a person added to the mock NIDA may carry a photo of up to 1 MB (base64). Only this route takes more than
  // the default 100 kB; it runs before Nest's own parser, which then leaves the parsed body alone.
  // Wrapped: Nest skips its own parser for every route if it finds a middleware named "jsonParser".
  const largeBody = json({ limit: "2mb" });
  app.use("/staff/nida/people", (req: Request, res: Response, next: NextFunction) => largeBody(req, res, next));
  // D74, D78: a voice note of up to 2 minutes, at most 2.5 MB, is up to about 3.4 MB once base64-encoded.
  const voiceBody = json({ limit: "3.5mb" });
  app.use(/^\/(agent\/)?cases\/[^/]+\/voice$/, (req: Request, res: Response, next: NextFunction) => voiceBody(req, res, next));
  app.enableCors({ origin: env.webUrl, credentials: true });
  app.enableShutdownHooks();
  await app.listen(env.port);
  console.log(`API listening on ${env.port}`);
}
void bootstrap();
