/**
 * Azure App Service's front end writes the caller into X-Forwarded-For with its port ("1.2.3.4:51234").
 * Express would take that whole string as req.ip, so each connection would look like a new address:
 * address checks would fail and per-address limits would never add up. Drop the port (D67).
 */
export function withoutPorts(xff: string): string {
  return xff
    .split(",")
    .map((part) => {
      const ip = part.trim();
      const v6 = /^\[([0-9a-f:.]+)\]:\d+$/i.exec(ip);
      if (v6) return v6[1];
      const v4 = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip);
      return v4 ? v4[1] : ip;
    })
    .join(", ");
}

export function stripForwardedPorts(req: { headers: Record<string, string | string[] | undefined> }, _res: unknown, next: () => void) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") req.headers["x-forwarded-for"] = withoutPorts(xff);
  next();
}
