import pg from "pg";

export const API = "http://127.0.0.1:4099";
export const NIDA = "http://127.0.0.1:4199";
export const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL ?? `postgresql://${process.env.USER}@localhost:5432/ubuzima_test` });

/** A tiny cookie-keeping client, like one browser. */
export function browser() {
  let cookie = "";
  return async function call(path: string, body?: unknown, method?: "PUT" | "DELETE") {
    const res = await fetch(API + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: { "content-type": "application/json", cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return { status: res.status, body: await res.json().catch(() => null) };
  };
}

export async function latestEmail(to: string) {
  const r = await db.query(`select subject, text from "EmailMessage" where "to" = $1 order by "createdAt" desc limit 1`, [to]);
  return r.rows[0] as { subject: string; text: string };
}

export const codeIn = (text: string) => text.match(/(\d{3}) (\d{3})/)!.slice(1).join("");
export const linkTokenIn = (text: string) => text.match(/\/staff\/(?:invitation|reset)\/([\w-]+)/)![1];

/** Moves a lock into the past, as if 15 minutes had gone by. */
export const expireLocks = () => db.query(`update "LoginThrottle" set "lockedUntil" = now() at time zone 'utc' - interval '1 minute'`);

/** Logs a seeded staff member in through password + emailed code. */
export async function staffLogin(email: string, password = "Ubuzima-demo-2026") {
  const b = browser();
  await b("/auth/staff/login", { email, password });
  await b("/auth/staff/code", { code: codeIn((await latestEmail(email)).subject) });
  return b;
}
