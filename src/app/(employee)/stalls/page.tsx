import { Assistant } from "@/components/assistant";
import { CartBar, CartButton } from "@/components/cart-sheet";
import { SiteHeader } from "@/components/site-header";
import { StallGrid } from "@/components/stall-grid";
import { assistantConfig } from "@/lib/assistant/config";
import { brandNames } from "@/lib/brand";
import { isStallOpen, waitCopy } from "@/lib/hours";
import { ratingCopy, stallRatings } from "@/lib/ratings";
import { activeOrderCounts } from "@/lib/stall-load";
import { prisma } from "@/lib/prisma";
import { getEmployeeSession } from "@/lib/session";

export const metadata = { title: "Stalls" };

export default async function StallsPage() {
  const session = await getEmployeeSession();
  const rows = await prisma.stall.findMany({
    orderBy: { name: "asc" },
    include: { items: { where: { archived: false }, select: { name: true } } },
  });
  const [active, ratings] = await Promise.all([activeOrderCounts(), stallRatings()]);
  const stalls = rows
    .map((stall) => ({
      id: stall.id,
      name: stall.name,
      cuisine: stall.cuisine,
      description: stall.description,
      location: stall.location,
      vegOnly: stall.vegOnly,
      wait: waitCopy(active.get(stall.id) ?? 0, stall.prepMinutes),
      rating: ratingCopy(ratings.get(stall.id)),
      accent: stall.accent,
      open: !stall.paused && isStallOpen(stall.openTime, stall.closeTime),
      paused: stall.paused,
      openTime: stall.openTime,
      closeTime: stall.closeTime,
      dishes: stall.items.map((item) => item.name),
    }))
    .sort((a, b) => Number(b.open) - Number(a.open) || a.name.localeCompare(b.name));
  const openCount = stalls.filter((stall) => stall.open).length;

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="employee" name={session?.name} current="stalls" right={<CartButton />} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-24">
        <h1 className="text-2xl font-semibold tracking-tight">{brandNames().name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {openCount} of {stalls.length} stalls open now (IST) · order now, pick up at your slot.
          Hi {session!.name.split(" ")[0]}.
        </p>
        <div className="mt-5">
          <StallGrid stalls={stalls} />
        </div>
      </main>
      <CartBar />
      {session && assistantConfig() ? <Assistant owner={session.uid} /> : null}
    </div>
  );
}
