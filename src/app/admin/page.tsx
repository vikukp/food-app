import { notFound } from "next/navigation";
import { AdminStallRow } from "@/components/admin-stall-row";
import { SiteHeader } from "@/components/site-header";
import { getAdminSession } from "@/lib/admin";
import { hoursLabel, isStallOpen } from "@/lib/hours";
import { formatInr } from "@/lib/money";
import { OPEN_STATUSES } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { canChangePin } from "@/lib/session";
import { vendorDaySummary } from "@/lib/vendor-queries";

export const metadata = { title: "Food court admin" };

export default async function AdminPage() {
  const admin = await getAdminSession();
  // Not a link anyone else should learn about.
  if (!admin) notFound();

  const stalls = await prisma.stall.findMany({ orderBy: { name: "asc" } });
  const waiting = await prisma.order.groupBy({
    by: ["stallId"],
    where: { status: { in: [...OPEN_STATUSES] } },
    _count: { _all: true },
  });
  const waitingBy = new Map(waiting.map((row) => [row.stallId, row._count._all]));
  const summaries = await Promise.all(stalls.map((stall) => vendorDaySummary(stall.id)));
  const total = summaries.reduce(
    (sum, s) => ({ orders: sum.orders + s.orders, revenueInr: sum.revenueInr + s.revenueInr }),
    { orders: 0, revenueInr: 0 },
  );

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="employee" name={admin.name} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Food court admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Today across {stalls.length} stalls: {total.orders} orders, {formatInr(total.revenueInr)}.
          {canChangePin(admin)
            ? " PIN resets are available for the next few minutes."
            : " To reset a stall PIN, sign in again with a one-time code."}
        </p>
        <ul className="mt-5 space-y-3">
          {stalls.map((stall, i) => (
            <AdminStallRow
              key={stall.id}
              stall={{
                id: stall.id,
                name: stall.name,
                location: stall.location,
                hours: hoursLabel(stall.openTime, stall.closeTime),
                paused: stall.paused,
                open: !stall.paused && isStallOpen(stall.openTime, stall.closeTime),
                waiting: waitingBy.get(stall.id) ?? 0,
                summary: summaries[i],
              }}
            />
          ))}
        </ul>
      </main>
    </div>
  );
}
