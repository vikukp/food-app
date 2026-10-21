import { NextResponse } from "next/server";
import { csvRow } from "@/lib/csv";
import { serviceDay } from "@/lib/hours";
import { paymentLabel, statusLabel } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/session";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const campusTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

// One trading day of this stall's orders as CSV, for the stall's accounts.
export async function GET(request: Request) {
  const session = await getVendorSession();
  if (!session) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const stall = await prisma.stall.findUnique({ where: { id: session.stallId } });
  if (!stall) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const asked = new URL(request.url).searchParams.get("day") ?? "";
  const day = DAY_PATTERN.test(asked) ? asked : serviceDay(stall.openTime, stall.closeTime);
  const orders = await prisma.order.findMany({
    where: { stallId: stall.id, tokenDay: day },
    include: { items: true },
    orderBy: { createdAt: "asc" },
  });

  const lines = [
    csvRow(["Token", "Placed (IST)", "Pickup", "Status", "Employee", "Employee ID", "Items", "Payment", "Payment ref", "Total (INR)", "Cancel reason"]),
    ...orders.map((order) =>
      csvRow([
        order.token,
        campusTime.format(order.createdAt),
        order.pickupSlot,
        statusLabel(order.status),
        order.employeeName,
        order.employeeId,
        order.items.map((item) => `${item.qty}x ${item.name} @ ${item.priceInr}`).join("; "),
        paymentLabel(order.paymentMethod),
        order.paymentRef,
        order.totalInr,
        order.status === "CANCELLED" ? (order.cancelledBy === "employee" ? "Cancelled by the employee" : order.cancelReason) : "",
      ]),
    ),
  ];
  return new NextResponse(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${stall.id}-${day}.csv"`,
    },
  });
}
