/**
 * NFR 4: how much each page downloads on a first visit, and how long that takes on a 3G connection.
 * Run against a production build:  pnpm --filter @ubuzima/web build && npx next start -p 3100  (in apps/web), then
 *   pnpm --filter @ubuzima/api exec tsx ../../scripts/page-weight.mts http://localhost:3100
 * Writes docs/performance-pages.json, which docs/PERFORMANCE.md quotes.
 *
 * The 3G model uses WebPageTest's "3G" connection profile: 1.6 Mbps down, 300 ms round trip
 * (and "3G Slow": 400 kbps, 400 ms). A first visit needs about 4 round trips to connect (DNS, TCP, TLS,
 * request), one more once the page names its files, and the bytes at the line's speed. Files after the page
 * are fetched in parallel over one HTTP/2 connection, so they add their bytes, not more round trips.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const base = process.argv[2] ?? "http://localhost:3100";
const PROFILES = { "3G": { kbps: 1600, rtt: 300 }, "3G Slow": { kbps: 400, rtt: 400 } };
const seconds = (bytes: number, p: { kbps: number; rtt: number }) => (5 * p.rtt + (bytes * 8) / p.kbps) / 1000;

async function size(url: string, cookie?: string) {
  const res = await fetch(url, { headers: cookie ? { cookie } : {} });
  const body = Buffer.from(await res.arrayBuffer());
  // Fonts and images are already compressed; text is sent gzipped by the server.
  const compressed = /\.(woff2?|png|jpe?g|webp)(\?|$)/.test(url) ? body.length : gzipSync(body).length;
  return { body: body.toString("utf8"), bytes: compressed };
}

async function page(path: string, cookie?: string) {
  const html = await size(base + path, cookie);
  const files = new Set<string>();
  for (const m of html.body.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.(?:js|css|woff2))"/g)) files.add(m[1]);
  let assets = 0;
  for (const f of files) assets += (await size(base + f)).bytes;
  const total = html.bytes + assets;
  return {
    page: path,
    files: files.size,
    htmlKB: Math.round(html.bytes / 102.4) / 10,
    totalKB: Math.round(total / 102.4) / 10,
    "3G (s)": Math.round(seconds(total, PROFILES["3G"]) * 10) / 10,
    "3G Slow (s)": Math.round(seconds(total, PROFILES["3G Slow"]) * 10) / 10,
  };
}

const login = await fetch(`${base}/api/auth/patient/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ nationalId: "1199270045823116", dateOfBirth: "1992-03-14", name: "Aline" }),
});
const cookie = login.headers.get("set-cookie")?.split(";")[0];

const results = [];
for (const p of ["/", "/emergency", "/login", "/check"]) results.push(await page(p));
for (const p of ["/home", "/cases/new"]) results.push(await page(p, cookie));
console.table(results);
writeFileSync(resolve(import.meta.dirname, "../docs/performance-pages.json"), JSON.stringify({ measuredAt: new Date().toISOString(), profiles: PROFILES, results }, null, 2) + "\n");
