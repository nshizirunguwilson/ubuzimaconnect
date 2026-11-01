import { Injectable } from "@nestjs/common";
import { LIMITS } from "@ubuzima/shared";
import { DbService } from "../common/db.service";

export type Failure = { locked: false; left: number } | { locked: true; until: Date; locksInARow: number };

/**
 * Slows down password and ID guessing: 5 failed attempts lock the key for 15 minutes.
 * The key is a hashed national ID or a staff email, and failures are counted even when no account exists,
 * so the lock gives nothing away about which accounts exist.
 */
@Injectable()
export class ThrottleService {
  constructor(private db: DbService) {}

  /** When the lock on this key ends, or null when it isn't locked. */
  async lockedUntil(key: string): Promise<Date | null> {
    const throttle = await this.db.client.loginThrottle.findUnique({ where: { key } });
    const lockedUntil = throttle?.lockedUntil;
    if (lockedUntil && lockedUntil.getTime() > Date.now()) return lockedUntil;
    return null;
  }

  /** Counts a failed attempt, and locks the key when it reaches the limit. */
  async fail(key: string): Promise<Failure> {
    const throttle = await this.db.client.loginThrottle.upsert({
      where: { key },
      create: { key, failures: 1 },
      update: { failures: { increment: 1 } },
    });

    if (throttle.failures < LIMITS.maxFailedAttempts) {
      return { locked: false, left: LIMITS.maxFailedAttempts - throttle.failures };
    }

    const until = new Date(Date.now() + LIMITS.lockMinutes * 60_000);
    const locked = await this.db.client.loginThrottle.update({
      where: { key },
      data: { failures: 0, lockedUntil: until, locks: { increment: 1 } },
    });
    return { locked: true, until, locksInARow: locked.locks };
  }

  /** Forgets the failures, after a successful login. */
  clear(key: string) {
    return this.db.client.loginThrottle.deleteMany({ where: { key } });
  }
}
