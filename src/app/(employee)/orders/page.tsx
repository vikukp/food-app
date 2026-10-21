import Link from "next/link";
import { CartButton } from "@/components/cart-sheet";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/money";
import { statusLabel } from "@/lib/orders";
import { maskPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { getEmployeeSession } from "@/lib/session";

export const metadata = { title: "My orders" };

export default async function OrdersPage() {
  const session = await getEmployeeSession();
  const orders = session
    ? await prisma.order.findMany({
        where: { employeeId: session.employeeId },
        include: { stall: true },
        orderBy: { createdAt: "desc" },
        take: 40,
      })
    : [];

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="employee" name={session?.name} right={<CartButton />} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">My orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tokens stay here if you close the QR screen.
        </p>
        {session ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Signed in as {session.name} · {session.employeeId} · {maskPhone(session.phone)} ·{" "}
            <Link href="/enter?reset=1" className="font-medium text-emerald-800 underline-offset-4 hover:underline">
              Change PIN
            </Link>
          </p>
        ) : null}
        {orders.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed bg-card p-8 text-center">
            <p className="font-medium">No orders yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Lunch from the food court will show up here after checkout.
            </p>
            <Button className="mt-4" render={<Link href="/stalls" />}>
              Browse stalls
            </Button>
          </div>
        ) : (
          <ul className="mt-5 space-y-3">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className="block rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-lg font-semibold">{order.token}</p>
                      <p className="text-sm text-muted-foreground">
                        {order.stall.name} · pickup {order.pickupSlot}
                      </p>
                    </div>
                    <Badge variant="outline">{statusLabel(order.status)}</Badge>
                  </div>
                  <p className="mt-2 text-sm">{formatInr(order.totalInr)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
