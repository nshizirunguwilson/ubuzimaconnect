import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations use DIRECT_URL when it is set and not empty; otherwise DATABASE_URL, which the app always uses.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || "" },
});
