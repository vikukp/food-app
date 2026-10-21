import { serviceDay } from "@/lib/hours";
import { OPEN_STATUSES } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { toVendorOrder, vendorOrderInclude, type VendorDaySummary } from "@/lib/vendor-orders";

// The "done" tab shows the latest collected or cancelled orders, not the whole day.
const RECENT_DONE = 30;

export async function listVendorOrders(stallId: string) {
  const [active, collected] = await Promise.all([
    prisma.order.findMany({
      where: { stallId, status: { in: [...OPEN_STATUSES] } },
      include: vendorOrderInclude,
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.findMany({
      where: { stallId, status: { notIn: [...OPEN_STATUSES] } },
      include: vendorOrderInclude,
      orderBy: { updatedAt: "desc" },
      take: RECENT_DONE,
    }),
  ]);
  return [...active, ...collected.reverse()].map(toVendorOrder);
}

async function stallServiceDay(stallId: string) {
  const stall = await prisma.stall.findUnique({ where: { id: stallId }, select: { openTime: true, closeTime: true } });
  return stall ? serviceDay(stall.openTime, stall.closeTime) : "";
}

// Changes whenever any of the stall's orders is placed or moves on, or the
// trading day rolls over (the "Today" numbers reset), so the
// counter's 3-second poll can be answered with 304 when nothing happened.
export async function vendorQueueVersion(stallId: string) {
  // Counts per status as well as the newest update: every status change moves
  // a count, so it shows even if two writes commit out of timestamp order.
  const rows = await prisma.order.groupBy({
    by: ["status"],
    where: { stallId },
    _max: { updatedAt: true },
    _count: { _all: true },
  });
  const counts = rows
    .map((row) => `${row.status}:${row._count._all}`)
    .sort()
    .join(",");
  const newest = Math.max(0, ...rows.map((row) => row._max.updatedAt?.getTime() ?? 0));
  // Includes the stall, so a shared browser never reuses another stall's copy.
  return `"${stallId}-${await stallServiceDay(stallId)}-${counts}-${newest}"`;
}

// Today's numbers for the counter (campus day). Cancelled orders are counted
// separately and left out of revenue and top items.
export async function vendorDaySummary(stallId: string): Promise<VendorDaySummary> {
  const tokenDay = await stallServiceDay(stallId);
  const [byStatus, top] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      where: { stallId, tokenDay },
      _count: { _all: true },
      _sum: { totalInr: true },
    }),
    prisma.orderItem.groupBy({
      by: ["name"],
      where: { order: { stallId, tokenDay, status: { not: "CANCELLED" } } },
      _sum: { qty: true },
      orderBy: { _sum: { qty: "desc" } },
      take: 3,
    }),
  ]);
  const live = byStatus.filter((row) => row.status !== "CANCELLED");
  return {
    orders: live.reduce((sum, row) => sum + row._count._all, 0),
    revenueInr: live.reduce((sum, row) => sum + (row._sum.totalInr ?? 0), 0),
    cancelled: byStatus.find((row) => row.status === "CANCELLED")?._count._all ?? 0,
    topItems: top.map((row) => ({ name: row.name, qty: row._sum.qty ?? 0 })),
  };
}

export async function vendorQueueSnapshot(stallId: string) {
  const [orders, summary] = await Promise.all([listVendorOrders(stallId), vendorDaySummary(stallId)]);
  return { orders, summary };
}
