import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import { env } from "./env";

/** A keyed hash. National IDs, emailed codes and link tokens are only ever stored like this. */
export function hmac(value: string) {
  return createHmac("sha256", env.secret).update(value).digest("hex");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** A random token for links and session cookies. */
export function newToken() {
  return randomBytes(32).toString("base64url");
}

/** A random 6-digit code, such as 042913. */
export function newCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * A UUID version 7 (RFC 9562), the same kind as the database's own keys.
 * Used when an id is needed before the row is written.
 */
export function uuid7() {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(Date.now(), 0, 6); // the first 48 bits are the time, so ids sort by creation
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Compares two hex hashes in constant time, so the time taken doesn't hint at how much matched. */
export function sameHash(first: string, second: string) {
  const firstBytes = Buffer.from(first, "hex");
  const secondBytes = Buffer.from(second, "hex");
  if (firstBytes.length !== secondBytes.length) return false;
  return timingSafeEqual(firstBytes, secondBytes);
}

/** The OWASP 2025 baseline for argon2id: 19 MiB of memory and 2 iterations. */
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export function checkPassword(hash: string, password: string) {
  return argon2.verify(hash, password).catch(() => false);
}

/**
 * A hash to check against when an email has no account, so a wrong email takes as long as a wrong password
 * and nobody can tell which emails have accounts. Made once, on first use.
 */
let dummyHashPromise: Promise<string> | null = null;
export function dummyHash() {
  dummyHashPromise ??= hashPassword(newToken());
  return dummyHashPromise;
}
