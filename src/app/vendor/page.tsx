import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { buttonVariants } from "@/components/ui/button";
import { VendorQueue } from "@/components/vendor-queue";
import { serviceDay } from "@/lib/hours";
import { prisma } from "@/lib/prisma";
import { getVendorSession } from "@/lib/session";
import { vendorQueueSnapshot } from "@/lib/vendor-queries";

export const metadata = { title: "Kitchen queue" };

export default async function VendorPage() {
  const session = await getVendorSession();
  if (!session) redirect("/vendor/login");

  const stall = await prisma.stall.findUnique({ where: { id: session.stallId } });
  if (!stall) redirect("/vendor/login");

  const snapshot = await vendorQueueSnapshot(stall.id);
  const today = serviceDay(stall.openTime, stall.closeTime);

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="vendor" stallName={stall.name} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">{stall.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {stall.location} · incoming orders refresh every few seconds.
        </p>
        {stall.paused ? (
          <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
            New orders are paused.{" "}
            <Link href="/vendor/menu" className="font-medium underline underline-offset-4">
              Resume under Menu
            </Link>
            .
          </p>
        ) : null}
        <div className="mt-5">
          <VendorQueue initial={snapshot} />
        </div>
        <form
          action="/api/vendor/orders/export"
          method="get"
          className="mt-8 flex flex-wrap items-end gap-2 border-t pt-4 text-sm"
        >
          <label className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">Sales for</span>
            <input
              type="date"
              name="day"
              defaultValue={today}
              max={today}
              className="h-9 rounded-lg border border-input bg-background px-2.5"
            />
          </label>
          <button type="submit" className={buttonVariants({ variant: "outline" })}>
            Download CSV
          </button>
          <Link
            href={`/display/${stall.id}`}
            target="_blank"
            className={buttonVariants({ variant: "ghost", className: "ml-auto" })}
          >
            Open counter display (for a TV)
          </Link>
        </form>
      </main>
    </div>
  );
}
