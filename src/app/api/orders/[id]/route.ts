import { NextResponse } from "next/server";
import { toOrderView } from "@/lib/order-view";
import { prisma } from "@/lib/prisma";
import { getEmployeeSession } from "@/lib/session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getEmployeeSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await context.params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      stall: { select: { name: true, location: true } },
      items: true,
    },
  });
  if (!order || order.employeeId !== session.employeeId) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  return NextResponse.json(await toOrderView(order));
}
