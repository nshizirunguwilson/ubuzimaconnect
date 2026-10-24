import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations use the direct connection (Supabase session pooler); the app uses DATABASE_URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "" },
});
