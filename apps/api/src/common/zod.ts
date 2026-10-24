import type { ZodType } from "zod";
import { ApiException } from "./errors";

/** Validates a request body with a shared schema and returns field messages for the form. */
export function parse<T>(schema: ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".") || "form";
    fields[key] ??= issue.message;
  }
  throw new ApiException(400, "VALIDATION", Object.values(fields)[0] ?? "Check the form", { fields });
}
