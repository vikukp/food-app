import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { EMPLOYEE_COOKIE, VENDOR_COOKIE } from "@/lib/demo";
import { sessionSecret } from "@/lib/secret";
import { parseEmployeeClaims } from "@/lib/session-claims";
import { verifyToken } from "@/lib/signed-token";

const isDev = process.env.NODE_ENV !== "production";

function buildCsp(nonce: string) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Tailwind and the UI primitives set inline style attributes; nonces do not cover those.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function applySecurityHeaders(response: NextResponse, request: NextRequest, csp: string) {
  response.headers.set("Content-Security-Policy", csp);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  if (proto === "https") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const secret = sessionSecret();
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const needsEmployee =
    pathname.startsWith("/stalls") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/orders");
  const needsVendor = pathname === "/vendor" || pathname.startsWith("/vendor/menu");

  if (needsEmployee) {
    const claims = parseEmployeeClaims(await verifyToken(request.cookies.get(EMPLOYEE_COOKIE)?.value, secret));
    if (!claims) {
      const response = NextResponse.redirect(new URL("/enter", request.url));
      response.cookies.delete(EMPLOYEE_COOKIE);
      return applySecurityHeaders(response, request, csp);
    }
  }

  if (needsVendor) {
    const claims = await verifyToken<{ kind?: string }>(request.cookies.get(VENDOR_COOKIE)?.value, secret);
    if (claims?.kind !== "vendor") {
      const response = NextResponse.redirect(new URL("/vendor/login", request.url));
      response.cookies.delete(VENDOR_COOKIE);
      return applySecurityHeaders(response, request, csp);
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return applySecurityHeaders(response, request, csp);
}

export const config = {
  matcher: [
    // Everything except build assets and static files, which get headers from next.config.ts.
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|svg|jpg|jpeg|webp|ico|txt|xml|json|webmanifest)$).*)",
  ],
};
