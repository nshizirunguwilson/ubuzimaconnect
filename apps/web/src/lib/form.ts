import type { ZodType } from "zod";

/** Runs a shared schema in the browser and returns the first message per field. */
export function check<T>(
  schema: ZodType<T>,
  value: unknown,
): { data: T; errors: null } | { data: null; errors: Record<string, string> } {
  const result = schema.safeParse(value);
  if (result.success) return { data: result.data, errors: null };
  const errors: Record<string, string> = {};
  for (const i of result.error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
  return { data: null, errors };
}
