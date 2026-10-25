import { NextResponse } from "next/server";
import { EMPLOYEE_COOKIE } from "@/lib/demo";
import { sameSite } from "@/lib/same-site";

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
