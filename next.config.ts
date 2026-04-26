import type { NextConfig } from "next";

// Security headers applied to every response served by Next.
// CSP keeps 'unsafe-inline' for style/script because:
//  - Tailwind 4 + Next font injection write inline styles.
//  - The theme-bootstrap script (dark-mode pre-paint) is inline.
// Production removes 'unsafe-eval'; dev keeps it for Next's tooling.
const isDev = process.env.NODE_ENV !== "production";
function originFromApiBase(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return "'self'";
  }
}
const apiOrigin = originFromApiBase(
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api",
);
const scriptSrc = ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])];
const connectSrc = [
  "'self'",
  apiOrigin,
  ...(isDev ? ["ws://localhost:3000", "ws://127.0.0.1:3000"] : []),
];
const imgSrc = ["'self'", "data:", "blob:", apiOrigin, "https:"];

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), camera=(), payment=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src ${scriptSrc.join(" ")}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      `img-src ${imgSrc.join(" ")}`,
      `connect-src ${connectSrc.join(" ")}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
