/** FR 10.1 and 10.2: logins are logged with the device type, never the full user agent. */
export function deviceType(userAgent: string | undefined): "phone" | "tablet" | "computer" | "unknown" {
  if (!userAgent) return "unknown";
  if (/ipad|tablet|(android(?!.*mobile))/i.test(userAgent)) return "tablet";
  if (/mobi|iphone|android/i.test(userAgent)) return "phone";
  return "computer";
}
