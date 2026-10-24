import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { env } from "./common/env";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ["error", "warn", "log"] });
  // req.ip must be the visitor, not a proxy: the code-guessing pause and the logs use it (FR 11.7, NFR 9).
  // In production a patient's request passes Vercel's /api rewrite, then Azure's front end: 2 hops (D67).
  app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS ?? 1));
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.webUrl, credentials: true });
  app.enableShutdownHooks();
  await app.listen(env.port);
  console.log(`API listening on ${env.port}`);
}
void bootstrap();
