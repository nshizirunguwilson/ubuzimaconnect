import type { ZodType } from "zod";

/** Runs a shared schema in the browser and returns the first message per field. */
export function check<T>(schema: ZodType<T>, value: unknown): { data: T; errors: null } | { data: null; errors: Record<string, string> } {
  const r = schema.safeParse(value);
  if (r.success) return { data: r.data, errors: null };
  const errors: Record<string, string> = {};
  for (const i of r.error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
  return { data: null, errors };
}
