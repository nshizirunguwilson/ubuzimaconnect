import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import { env } from "./env";

/** Keyed hash: national IDs, emailed codes and link tokens are stored only like this. */
export const hmac = (value: string) => createHmac("sha256", env.secret).update(value).digest("hex");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const newToken = () => randomBytes(32).toString("base64url");
export const newCode = () => randomInt(0, 1_000_000).toString().padStart(6, "0");

/** RFC 9562 UUID v7, like the database's own keys; for an id needed before the row is written. */
export function uuid7() {
  const b = randomBytes(16);
  b.writeUIntBE(Date.now(), 0, 6);
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function sameHash(a: string, b: string) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** OWASP 2025 argon2id baseline: 19 MiB memory, 2 iterations. */
const ARGON = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
export const hashPassword = (password: string) => argon2.hash(password, ARGON);
export const checkPassword = (hash: string, password: string) => argon2.verify(hash, password).catch(() => false);

/** Checked when the email has no account, so a wrong email takes as long as a wrong password. */
let dummy: Promise<string> | null = null;
export const dummyHash = () => (dummy ??= hashPassword(newToken()));
