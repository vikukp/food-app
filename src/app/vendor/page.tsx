import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { VendorQueue } from "@/components/vendor-queue";
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
      </main>
    </div>
  );
}
