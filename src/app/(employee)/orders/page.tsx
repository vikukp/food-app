import Link from "next/link";
import { CartButton } from "@/components/cart-sheet";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { isAdmin } from "@/lib/admin";
import { formatInr } from "@/lib/money";
import { statusLabel } from "@/lib/orders";
import { maskPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { getEmployeeSession } from "@/lib/session";

export const metadata = { title: "My orders" };

const LIMIT = 40;

const orderDay = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

export default async function OrdersPage() {
  const session = await getEmployeeSession();
  const recent = session
    ? await prisma.order.findMany({
        where: { employeeId: session.employeeId },
        include: { stall: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: LIMIT,
      })
    : [];
  // A checkout that the limit cut in two comes back whole.
  const cut = recent.length === LIMIT ? recent.at(-1)?.checkoutId : null;
  const rest =
    session && cut
      ? await prisma.order.findMany({
          where: { employeeId: session.employeeId, checkoutId: cut, id: { notIn: recent.map((order) => order.id) } },
          include: { stall: true },
        })
      : [];
  // Tickets paid for together share a card, newest card first and its tickets
  // in bag order; an order on its own is a group of one.
  const groups = new Map<string, typeof recent>();
  for (const order of [...recent, ...rest]) {
    const key = order.checkoutId ?? order.id;
    groups.set(key, [...(groups.get(key) ?? []), order]);
  }
  const cards = [...groups.values()].map((group) =>
    group.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)),
  );

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="employee" name={session?.name} current="orders" right={<CartButton />} />
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
            {isAdmin(session) ? (
              <>
                {" · "}
                <Link href="/admin" className="font-medium text-emerald-800 underline-offset-4 hover:underline">
                  Food court admin
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        {cards.length === 0 ? (
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
            {cards.map((group) =>
              group.length === 1 ? (
                <li key={group[0].id}>
                  <Link
                    href={`/orders/${group[0].id}`}
                    className="block rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-lg font-semibold">{group[0].token}</p>
                        <p className="text-sm text-muted-foreground">
                          {group[0].stall.name} · {orderDay.format(group[0].createdAt)}, pickup {group[0].pickupSlot}
                        </p>
                      </div>
                      <Badge variant="outline">{statusLabel(group[0].status)}</Badge>
                    </div>
                    <p className="mt-2 text-sm">{formatInr(group[0].totalInr)}</p>
                  </Link>
                </li>
              ) : (
                <li key={group[0].id} className="rounded-xl border bg-card">
                  <p className="flex justify-between gap-3 px-4 pt-3 text-sm text-muted-foreground">
                    <span>
                      {orderDay.format(group[0].createdAt)} · {group.length} stalls, paid together
                    </span>
                    <span className="font-medium text-foreground">
                      {formatInr(group.reduce((sum, order) => sum + order.totalInr, 0))}
                    </span>
                  </p>
                  <ul className="mt-1 divide-y">
                    {group.map((order) => (
                      <li key={order.id}>
                        <Link
                          href={`/orders/${order.id}`}
                          className="flex items-start justify-between gap-3 rounded-xl px-4 py-3 transition-colors hover:bg-muted/60"
                        >
                          <div>
                            <p className="font-mono text-lg font-semibold">{order.token}</p>
                            <p className="text-sm text-muted-foreground">
                              {order.stall.name} · pickup {order.pickupSlot} · {formatInr(order.totalInr)}
                            </p>
                          </div>
                          <Badge variant="outline">{statusLabel(order.status)}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ),
            )}
          </ul>
        )}
      </main>
    </div>
  );
}
