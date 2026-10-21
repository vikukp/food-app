import { CartButton, MobileCartBar } from "@/components/cart-sheet";
import { SiteHeader } from "@/components/site-header";
import { StallGrid } from "@/components/stall-grid";
import { isStallOpen } from "@/lib/hours";
import { prisma } from "@/lib/prisma";
import { getEmployeeSession } from "@/lib/session";

export const metadata = { title: "Stalls" };

export default async function StallsPage() {
  const session = await getEmployeeSession();
  const rows = await prisma.stall.findMany({ orderBy: { name: "asc" } });
  const stalls = rows
    .map((stall) => ({
      id: stall.id,
      name: stall.name,
      cuisine: stall.cuisine,
      description: stall.description,
      location: stall.location,
      vegOnly: stall.vegOnly,
      busyLevel: stall.busyLevel,
      accent: stall.accent,
      open: isStallOpen(stall.openTime, stall.closeTime),
      openTime: stall.openTime,
      closeTime: stall.closeTime,
    }))
    .sort((a, b) => Number(b.open) - Number(a.open) || a.name.localeCompare(b.name));
  const openCount = stalls.filter((stall) => stall.open).length;

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="employee" name={session?.name} right={<CartButton />} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">IWF food court</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {openCount} of {stalls.length} stalls open now (IST) · order now, pick up at your slot.
          Hi {session!.name.split(" ")[0]}.
        </p>
        <div className="mt-5">
          <StallGrid stalls={stalls} />
        </div>
      </main>
      <MobileCartBar />
    </div>
  );
}
