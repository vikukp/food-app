import { NextResponse } from "next/server";
import { EMPLOYEE_COOKIE } from "@/lib/demo";

// A browser form post carries Origin; it must name this site. Behind proxies
// X-Forwarded-Host may be a list (the first is what the browser used), and a
// default port may appear on one side only.
function sameSite(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (origin === "null") return false;
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(",")[0].trim();
  try {
    const url = new URL(origin);
    const bare = (value: string) => value.replace(url.protocol === "https:" ? /:443$/ : /:80$/, "");
    return bare(url.host) === bare(host);
  } catch {
    return false;
  }
}

// Employee sign-out. A plain route rather than a server action so the answer
// can carry Clear-Site-Data: on a shared phone that drops the saved bag and
// the offline ticket copies along with the session.
export async function POST(request: Request) {
  if (!sameSite(request)) {
    return NextResponse.json({ error: "Cross-site sign-out refused." }, { status: 403 });
  }
  // Relative, so the browser stays on the host it used (request.url carries
  // the bind address, e.g. 0.0.0.0, which form-action 'self' would refuse).
  const response = new NextResponse(null, { status: 303, headers: { Location: "/" } });
  response.cookies.delete(EMPLOYEE_COOKIE);
  response.headers.set("Clear-Site-Data", '"cache", "storage"');
  return response;
}
