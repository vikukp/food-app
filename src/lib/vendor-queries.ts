import { prisma } from "@/lib/prisma";
import { toVendorOrder, vendorOrderInclude } from "@/lib/vendor-orders";

export async function listVendorOrders(stallId: string) {
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const orders = await prisma.order.findMany({
    where: {
      stallId,
      OR: [{ status: { not: "COLLECTED" } }, { createdAt: { gte: since } }],
    },
    include: vendorOrderInclude,
    orderBy: { createdAt: "asc" },
  });
  return orders.map(toVendorOrder);
}
