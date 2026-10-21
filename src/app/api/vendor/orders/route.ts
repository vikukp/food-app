import { NextResponse } from "next/server";
import { getVendorSession } from "@/lib/session";
import { listVendorOrders, vendorQueueVersion } from "@/lib/vendor-queries";

export async function GET(request: Request) {
  const session = await getVendorSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const etag = await vendorQueueVersion(session.stallId);
  const headers = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (request.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return NextResponse.json(await listVendorOrders(session.stallId), { headers });
}
