import { NextResponse } from "next/server";
import { getVendorSession } from "@/lib/session";
import { listVendorOrders } from "@/lib/vendor-queries";

export async function GET() {
  const session = await getVendorSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  return NextResponse.json(await listVendorOrders(session.stallId));
}
