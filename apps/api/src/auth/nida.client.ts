import { Injectable, Logger } from "@nestjs/common";
import { LIMITS } from "@ubuzima/shared";
import { env } from "../common/env";

export type NidaPerson = {
  ref: string;
  fullName: string;
  firstName: string;
  dateOfBirth: string;
  sex: "FEMALE" | "MALE";
  district: string;
};
export type NidaResult = { match: false } | { match: true; person: NidaPerson; children: NidaPerson[] };

export class NidaUnavailable extends Error {}

/** The national identity service (mocked in apps/nida-mock). Slow or failing calls count as unavailable (FR 1.5). */
@Injectable()
export class NidaClient {
  private log = new Logger("NIDA");

  async verify(nationalId: string, dateOfBirth: string, name: string): Promise<NidaResult> {
    return this.call<NidaResult>("/v1/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nationalId, dateOfBirth, name }),
    });
  }

  async photo(ref: string): Promise<string> {
    const res = await this.raw(`/v1/photos/${encodeURIComponent(ref)}`, {});
    return res.text();
  }

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    return (await this.raw(path, init)).json() as Promise<T>;
  }

  private async raw(path: string, init: RequestInit) {
    try {
      const res = await fetch(env.nidaUrl + path, {
        ...init,
        headers: { ...init.headers, "x-api-key": env.nidaKey },
        signal: AbortSignal.timeout(LIMITS.nidaTimeoutMs),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res;
    } catch (e) {
      this.log.warn(`Unavailable: ${(e as Error).message}`);
      throw new NidaUnavailable();
    }
  }
}
