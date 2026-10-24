import { Injectable } from "@nestjs/common";
import { LIMITS } from "@ubuzima/shared";
import { DbService } from "../common/db.service";

export type Failure = { locked: false; left: number } | { locked: true; until: Date; locksInARow: number };

/**
 * FR 1.6 and 2.3: 5 failed attempts lock the key for 15 minutes. The key is a hashed national ID
 * or a staff email, and it is counted even when no account exists.
 */
@Injectable()
export class ThrottleService {
  constructor(private db: DbService) {}

  async lockedUntil(key: string): Promise<Date | null> {
    const t = await this.db.client.loginThrottle.findUnique({ where: { key } });
    return t?.lockedUntil && t.lockedUntil.getTime() > Date.now() ? t.lockedUntil : null;
  }

  async fail(key: string): Promise<Failure> {
    const t = await this.db.client.loginThrottle.upsert({
      where: { key },
      create: { key, failures: 1 },
      update: { failures: { increment: 1 } },
    });
    if (t.failures < LIMITS.maxFailedAttempts) return { locked: false, left: LIMITS.maxFailedAttempts - t.failures };
    const until = new Date(Date.now() + LIMITS.lockMinutes * 60_000);
    const locked = await this.db.client.loginThrottle.update({
      where: { key },
      data: { failures: 0, lockedUntil: until, locks: { increment: 1 } },
    });
    return { locked: true, until, locksInARow: locked.locks };
  }

  clear(key: string) {
    return this.db.client.loginThrottle.deleteMany({ where: { key } });
  }
}
