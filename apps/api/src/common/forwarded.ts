/**
 * Azure App Service writes the caller's address into X-Forwarded-For with its port: "1.2.3.4:51234".
 * Express would take that whole string as req.ip, so every connection would look like a new address:
 * address checks would fail and per-address limits would never add up. So the port is removed first.
 */
export function withoutPorts(forwardedFor: string): string {
  return forwardedFor
    .split(",")
    .map((part) => removePort(part.trim()))
    .join(", ");
}

function removePort(address: string) {
  const ipv6WithPort = /^\[([0-9a-f:.]+)\]:\d+$/i.exec(address); // "[2001:db8::1]:443"
  if (ipv6WithPort) return ipv6WithPort[1];

  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(address); // "1.2.3.4:51234"
  if (ipv4WithPort) return ipv4WithPort[1];

  return address;
}

/** Express middleware: cleans X-Forwarded-For before Express reads req.ip from it. */
export function stripForwardedPorts(
  request: { headers: Record<string, string | string[] | undefined> },
  _response: unknown,
  next: () => void,
) {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string") {
    request.headers["x-forwarded-for"] = withoutPorts(forwardedFor);
  }
  next();
}
