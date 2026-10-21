import { prisma } from "@/lib/prisma";
import { STALE_ORDER_MS } from "@/lib/stall-load";

export type DisplayBoard = { preparing: string[]; ready: string[] };

// Tokens only, never names or items: this is shown on a screen anyone can see.
export async function displayBoard(stallId: string): Promise<DisplayBoard> {
  const orders = await prisma.order.findMany({
    where: {
      stallId,
      status: { in: ["PLACED", "PREPARING", "READY"] },
      createdAt: { gte: new Date(Date.now() - STALE_ORDER_MS) },
    },
    select: { token: true, status: true },
    orderBy: [{ readyAt: "asc" }, { createdAt: "asc" }],
  });
  return {
    preparing: orders.filter((o) => o.status !== "READY").map((o) => o.token),
    ready: orders.filter((o) => o.status === "READY").map((o) => o.token),
  };
}
