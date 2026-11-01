import type { ZodType } from "zod";
import { ApiException } from "./errors";

/**
 * Checks a request body against a shared schema and returns the clean data.
 * When it fails, the error lists one message per form field, so the form can show each one beside its field.
 */
export function parse<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;

  const fieldMessages: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = issue.path.join(".") || "form";
    fieldMessages[field] ??= issue.message; // keep the first message for each field
  }

  const firstMessage = Object.values(fieldMessages)[0] ?? "Check the form";
  throw new ApiException(400, "VALIDATION", firstMessage, { fields: fieldMessages });
}
