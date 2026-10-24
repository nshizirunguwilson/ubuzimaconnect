import type { ApiError } from "@ubuzima/shared";

/** Thrown for any non-2xx answer; carries the API's code and sentence. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly error: ApiError,
  ) {
    super(error.message);
  }
}

const offline: ApiError = { code: "VALIDATION", message: "You seem to be offline. Check your connection and try again." };

/** Browser calls to the API through the same-origin /api rewrite. */
export async function api<T = unknown>(path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      ...init,
    });
  } catch {
    throw new ApiFailure(0, offline);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiFailure(res.status, data?.code ? data : { code: "VALIDATION", message: "Something went wrong. Try again." });
  }
  return data as T;
}
