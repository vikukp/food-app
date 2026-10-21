import Link from "next/link";
import { notFound } from "next/navigation";
import { CartButton, MobileCartBar } from "@/components/cart-sheet";
import { MenuList } from "@/components/menu-list";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hoursLabel, isStallOpen, opensLaterToday, waitCopy } from "@/lib/hours";
import { activeOrderCounts } from "@/lib/stall-load";
import { prisma } from "@/lib/prisma";
import { getEmployeeSession } from "@/lib/session";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const stall = await prisma.stall.findUnique({ where: { id } });
  return { title: stall?.name ?? "Stall" };
}

export default async function StallPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getEmployeeSession();
  const stall = await prisma.stall.findUnique({
    where: { id },
    include: {
      items: { where: { archived: false }, orderBy: [{ category: "asc" }, { name: "asc" }] },
    },
  });
  if (!stall) notFound();
  const open = !stall.paused && isStallOpen(stall.openTime, stall.closeTime);
  const active = (await activeOrderCounts([stall.id])).get(stall.id) ?? 0;

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="employee" name={session?.name} right={<CartButton />} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        <Button variant="ghost" size="sm" className="-ml-2 mb-3" render={<Link href="/stalls" />}>
          All stalls
        </Button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{stall.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {stall.cuisine} · {stall.location}
            </p>
          </div>
          <Badge variant={open ? "default" : "secondary"}>{stall.paused ? "Paused" : open ? "Open" : "Closed"}</Badge>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">{stall.description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {stall.vegOnly ? <Badge variant="outline">Pure veg</Badge> : null}
          {open ? <Badge variant="outline">{waitCopy(active, stall.prepMinutes)}</Badge> : null}
          <Badge variant="outline">{hoursLabel(stall.openTime, stall.closeTime)}</Badge>
        </div>
        {!open ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {stall.paused
              ? "This stall has paused new orders for a while. Check back soon, or pick another stall."
              : opensLaterToday(stall.openTime)
              ? `Opens at ${stall.openTime} IST. You can bag items now and pre-book a pickup slot after opening.`
              : `Closed for today. Reopens at ${stall.openTime} IST. Browse, or pick a stall that is open now.`}
          </p>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">
          Allergens are listed where the stall has added them. If you have an allergy, check with the counter
          before ordering.
        </p>
        <div className="mt-6">
          <MenuList
            stall={{ id: stall.id, name: stall.name }}
            items={stall.items}
          />
        </div>
      </main>
      <MobileCartBar />
    </div>
  );
}
