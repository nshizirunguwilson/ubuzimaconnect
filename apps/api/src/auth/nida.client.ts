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

export type NidaListed = {
  ref: string;
  nationalId: string | null;
  names: string[];
  dateOfBirth: string;
  sex: "FEMALE" | "MALE";
  district: string;
  parentRefs: string[];
  hasPhoto?: boolean;
  addedAt?: string | null;
};

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

  /** The identity photo: an uploaded JPEG or PNG for people added through the form (D73), else an SVG silhouette. */
  async photo(ref: string): Promise<{ type: string; body: Buffer }> {
    const res = await this.raw(`/v1/photos/${encodeURIComponent(ref)}`, {});
    return { type: res.headers.get("content-type")?.split(";")[0] ?? "image/svg+xml", body: Buffer.from(await res.arrayBuffer()) };
  }

  /** D73: everyone in the mock NIDA, for the administrator. */
  async people(): Promise<NidaListed[]> {
    return this.call<NidaListed[]>("/v1/people", {});
  }

  /** D73: add a made-up person. A refusal by the mock NIDA comes back as its message, not as "unavailable". */
  async addPerson(body: unknown): Promise<{ ok: true; person: NidaListed } | { ok: false; message: string }> {
    let res: Response;
    try {
      res = await fetch(env.nidaUrl + "/v1/people", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": env.nidaKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      this.log.warn(`Unavailable: ${(e as Error).message}`);
      throw new NidaUnavailable();
    }
    if (res.status === 400) return { ok: false, message: ((await res.json().catch(() => ({}))) as { message?: string }).message ?? "Check the details" };
    if (!res.ok) throw new NidaUnavailable();
    return { ok: true, person: (await res.json()) as NidaListed };
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
