import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { env } from "./common/env";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ["error", "warn", "log"] });
  // Behind Vercel's rewrite and Azure's front end: trust the first proxy for req.ip.
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.webUrl, credentials: true });
  app.enableShutdownHooks();
  await app.listen(env.port);
  console.log(`API listening on ${env.port}`);
}
void bootstrap();
