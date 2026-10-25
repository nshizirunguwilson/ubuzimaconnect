import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { stripForwardedPorts } from "./forwarded";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ["error", "warn", "log"] });
  // Azure's front end adds X-Forwarded-For; trust only that one hop so req.ip is the real caller.
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(stripForwardedPorts);
  // A person added through the form may carry a photo of up to 1 MB, base64-encoded (D73).
  app.useBodyParser("json", { limit: "2mb" });
  const port = Number(process.env.PORT ?? 4100);
  await app.listen(port);
  console.log(`Mock NIDA listening on ${port}`);
}
void bootstrap();
