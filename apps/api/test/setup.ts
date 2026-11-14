import { execSync, spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import pg from "pg";
import webpush from "web-push";

const root = resolve(import.meta.dirname, "../../..");
const DB = process.env.TEST_DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/ubuzima_test`;
export const API = "http://127.0.0.1:4099";
const NIDA = "http://127.0.0.1:4199";

const procs: ChildProcess[] = [];
const vapid = webpush.generateVAPIDKeys();

async function waitFor(url: string) {
  for (let i = 0; i < 60; i++) {
    if (await fetch(url).then((r) => r.ok).catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${url} did not start`);
}

export async function setup() {
  // Safety: the tests empty every table, so they only ever run against a database named *_test.
  if (!/\/[\w-]+_test(\?|$)/.test(DB)) throw new Error(`Refusing to run tests against ${DB}: the database name must end in _test`);
  const env = { ...process.env, DATABASE_URL: DB, DIRECT_URL: DB };
  execSync("pnpm --filter @ubuzima/db exec prisma migrate deploy", { cwd: root, env, stdio: "ignore" });
  await resetDatabase();
  execSync("pnpm --filter @ubuzima/api --filter @ubuzima/nida-mock build", { cwd: root, stdio: "ignore" });

  procs.push(spawn("node", ["apps/nida-mock/dist/main.js"], { cwd: root, env: { ...env, PORT: "4199", NIDA_DATABASE_URL: DB }, stdio: "ignore" }));
  procs.push(
    spawn("node", ["apps/api/dist/main.js"], {
      cwd: root,
      env: {
        ...env,
        PORT: "4099",
        NIDA_URL: NIDA,
        WEB_URL: "http://localhost:3000",
        RESEND_API_KEY: "",
        // A local stand-in for Gemini (test/fake-gemini.ts), started by the case tests.
        GEMINI_API_KEY: "test-key",
        GEMINI_BASE_URL: "http://127.0.0.1:4299",
        // Dispatch quickly so queue tests don't wait.
        DISPATCH_MS: "300",
        TIMER_MS: "300",
        // Fresh Web Push keys for each run; push.test.ts plays the browser's push service.
        VAPID_PUBLIC_KEY: vapid.publicKey,
        VAPID_PRIVATE_KEY: vapid.privateKey,
        VAPID_SUBJECT: "mailto:test@ubuzima.test",
        OFFER_MS: "2500",
      },
      stdio: "ignore",
    }),
  );
  await waitFor(`${NIDA}/health`);
  await waitFor(`${API}/health`);
}

/** Empties every table and seeds again, so each test file starts from the same data. */
export async function resetDatabase() {
  const client = new pg.Client({ connectionString: DB });
  await client.connect();
  const { rows } = await client.query(`select tablename from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations'`);
  await client.query(`truncate ${rows.map((r) => `"${r.tablename}"`).join(", ")} cascade`);
  // People added to the mock NIDA (D73) live in its own schema.
  await client.query(`do $$ begin if to_regclass('nida.person') is not null then truncate nida.person; end if; end $$`);
  await client.end();
  execSync("pnpm --filter @ubuzima/api seed", { cwd: root, env: { ...process.env, DATABASE_URL: DB }, stdio: "ignore" });
}

export async function teardown() {
  procs.forEach((p) => p.kill());
}
