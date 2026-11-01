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

/**
 * Talks to the national identity service (mocked in apps/nida-mock).
 * A call that is slow or fails counts as "NIDA is unavailable", and the patient is told so.
 */
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

  /** The identity photo: an uploaded JPEG or PNG for people added through the form, or else an SVG silhouette. */
  async photo(ref: string): Promise<{ type: string; body: Buffer }> {
    const response = await this.request(`/v1/photos/${encodeURIComponent(ref)}`, {});
    const type = response.headers.get("content-type")?.split(";")[0] ?? "image/svg+xml";
    const body = Buffer.from(await response.arrayBuffer());
    return { type, body };
  }

  /** Everyone in the mock NIDA, for the administrator. */
  async people(): Promise<NidaListed[]> {
    return this.call<NidaListed[]>("/v1/people", {});
  }

  /**
   * Adds a made-up person. When the mock NIDA refuses the details, its message comes back to show on the form,
   * rather than "unavailable". Photos make this request bigger, so it gets a longer time limit.
   */
  async addPerson(body: unknown): Promise<{ ok: true; person: NidaListed } | { ok: false; message: string }> {
    let response: Response;
    try {
      response = await fetch(env.nidaUrl + "/v1/people", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": env.nidaKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.log.warn(`Unavailable: ${(error as Error).message}`);
      throw new NidaUnavailable();
    }

    if (response.status === 400) {
      const refusal = (await response.json().catch(() => ({}))) as { message?: string };
      return { ok: false, message: refusal.message ?? "Check the details" };
    }
    if (!response.ok) throw new NidaUnavailable();

    const person = (await response.json()) as NidaListed;
    return { ok: true, person };
  }

  private async call<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.request(path, init);
    return response.json() as Promise<T>;
  }

  /** Any request to NIDA, with the API key and a time limit. Every failure becomes NidaUnavailable. */
  private async request(path: string, init: RequestInit) {
    try {
      const response = await fetch(env.nidaUrl + path, {
        ...init,
        headers: { ...init.headers, "x-api-key": env.nidaKey },
        signal: AbortSignal.timeout(LIMITS.nidaTimeoutMs),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      return response;
    } catch (error) {
      this.log.warn(`Unavailable: ${(error as Error).message}`);
      throw new NidaUnavailable();
    }
  }
}
