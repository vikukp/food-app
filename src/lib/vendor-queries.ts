import { OPEN_STATUSES } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { toVendorOrder, vendorOrderInclude } from "@/lib/vendor-orders";

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

// Changes whenever any of the stall's orders is placed or moves on, so the
// counter's 3-second poll can be answered with 304 when nothing happened.
export async function vendorQueueVersion(stallId: string) {
  const { _max, _count } = await prisma.order.aggregate({
    where: { stallId },
    _max: { updatedAt: true },
    _count: { _all: true },
  });
  // Includes the stall, so a shared browser never reuses another stall's copy.
  return `"${stallId}-${_count._all}-${_max.updatedAt?.getTime() ?? 0}"`;
}
