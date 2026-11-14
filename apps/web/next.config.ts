import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@ubuzima/shared"],
  turbopack: {
    rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } },
  },
  // The browser only ever talks to this origin; /api is passed to the NestJS API.
  // So the session cookie is first-party and no CORS is needed (DECISIONS.md D12).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
  // Browser protection headers on every page (NFR 1). No other site may show our
  // pages in a frame (clickjacking); location, microphone and camera stay allowed
  // for our own pages only. script-src is left out: Next.js adds inline scripts.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "geolocation=(self), microphone=(self), camera=(self), payment=(), usb=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
