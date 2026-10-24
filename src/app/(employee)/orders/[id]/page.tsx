import { notFound } from "next/navigation";
import { CartButton } from "@/components/cart-sheet";
import { OrderTicket } from "@/components/order-ticket";
import { SiteHeader } from "@/components/site-header";
import { checkoutOrderBy, toOrderView } from "@/lib/order-view";
import { prisma } from "@/lib/prisma";
import { getEmployeeSession } from "@/lib/session";

export const metadata = { title: "Order token" };

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getEmployeeSession();
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      stall: { select: { name: true, location: true } },
      items: true,
    },
  });
  if (!order || !session || order.employeeId !== session.employeeId) {
    notFound();
  }

  const checkout = order.checkoutId
    ? await prisma.order.findMany({
        where: { checkoutId: order.checkoutId, employeeId: session.employeeId },
        orderBy: checkoutOrderBy,
        select: { id: true, token: true, pickupSlot: true, totalInr: true, status: true, stall: { select: { name: true } } },
      })
    : [];
  const view = await toOrderView(order, checkout);

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="employee" name={session.name} current="orders" right={<CartButton />} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <OrderTicket initial={view} />
      </main>
    </div>
  );
}
