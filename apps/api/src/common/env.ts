function need(name: string, fallback?: string): string {
  const v = process.env[name] || fallback;
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const prod = process.env.NODE_ENV === "production";

export const env = {
  prod,
  port: Number(process.env.PORT ?? 4000),
  webUrl: need("WEB_URL", "http://localhost:3000"),
  nidaUrl: need("NIDA_URL", "http://localhost:4100"),
  nidaKey: need("NIDA_API_KEY", prod ? undefined : "dev-nida-key"),
  secret: need("APP_SECRET", prod ? undefined : "dev-only-secret-change-me-0123456789abcdef"),
  resendKey: process.env.RESEND_API_KEY || null,
  mailFrom: process.env.MAIL_FROM || "UbuzimaConnect <noreply@ubuzima.wilsonn.tech>",
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  /** DECISIONS.md D66: on the live demo, emails to the made-up demo addresses can be read at /demo/inbox. */
  demoInbox: process.env.DEMO_INBOX === "1",
  /** Web Push (VAPID). Without them no push is sent; everything else works. */
  vapid: process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
    ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject: process.env.VAPID_SUBJECT || "mailto:admin@ubuzima.test" }
    : null,
};
