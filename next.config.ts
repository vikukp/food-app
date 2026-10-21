import type { NextConfig } from "next";

// Headers that do not depend on the request. CSP (nonce) and HSTS are set per
// request in src/proxy.ts.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "qrcode"],
  poweredByHeader: false,
  // `next dev` binds 0.0.0.0 so the preview is reachable from outside the VM,
  // but the browser opens it as 127.0.0.1. Without this the dev server rejects
  // the HMR socket and client fetches as cross-origin and React never hydrates.
  allowedDevOrigins: ["127.0.0.1", "*.local"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};

export default nextConfig;
