/** A setting from the environment, or the fallback. Throws at startup when a required one is missing. */
function required(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const isProduction = process.env.NODE_ENV === "production";

/** Web Push keys (VAPID). Without them no push notification is sent; everything else works. */
function vapidKeys() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT || "mailto:admin@ubuzima.test" };
}

export const env = {
  prod: isProduction,
  port: Number(process.env.PORT ?? 4000),
  webUrl: required("WEB_URL", "http://localhost:3000"),
  nidaUrl: required("NIDA_URL", "http://localhost:4100"),
  // In production these two have no fallback, so a missing secret stops the API from starting.
  nidaKey: required("NIDA_API_KEY", isProduction ? undefined : "dev-nida-key"),
  secret: required("APP_SECRET", isProduction ? undefined : "dev-only-secret-change-me-0123456789abcdef"),
  resendKey: process.env.RESEND_API_KEY || null,
  mailFrom: process.env.MAIL_FROM || "UbuzimaConnect <noreply@ubuzima.wilsonn.tech>",
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  /** On the live demo, emails to the made-up demo addresses can be read at /demo/inbox. */
  demoInbox: process.env.DEMO_INBOX === "1",
  vapid: vapidKeys(),
};
