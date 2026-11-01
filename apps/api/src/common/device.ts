/** Logins are logged with the kind of device only, never the full user agent. */
export function deviceType(userAgent: string | undefined): "phone" | "tablet" | "computer" | "unknown" {
  if (!userAgent) return "unknown";

  // Android tablets say "Android" without "Mobile".
  const isTablet = /ipad|tablet|(android(?!.*mobile))/i.test(userAgent);
  if (isTablet) return "tablet";

  const isPhone = /mobi|iphone|android/i.test(userAgent);
  if (isPhone) return "phone";

  return "computer";
}
