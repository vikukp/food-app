import { NextResponse } from "next/server";
import { cancelNote, type OrderStatusUpdate } from "@/lib/order-view";
import { statusLabel } from "@/lib/orders";
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
  // The ticket polls this every few seconds; only the status changes, so the
  // QR image and line items come from the page render, not from every poll.
  const order = await prisma.order.findUnique({
    where: { id },
    select: { status: true, employeeId: true, cancelledBy: true, cancelReason: true },
  });
  if (!order || order.employeeId !== session.employeeId) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  const update: OrderStatusUpdate = {
    status: order.status,
    statusLabel: statusLabel(order.status),
    cancelNote: cancelNote(order),
  };
  return NextResponse.json(update);
}
