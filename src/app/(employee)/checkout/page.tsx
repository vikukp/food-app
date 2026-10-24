import Link from "next/link";
import { CartButton } from "@/components/cart-sheet";
import { CheckoutForm, type CheckoutStall } from "@/components/checkout-form";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { slotsWithRoom } from "@/lib/stall-load";
import { prisma } from "@/lib/prisma";
import { getEmployeeSession } from "@/lib/session";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const session = await getEmployeeSession();
  const stalls = await prisma.stall.findMany({
    select: {
      id: true,
      name: true,
      openTime: true,
      closeTime: true,
      paused: true,
      prepMinutes: true,
      slotCapacity: true,
    },
  });
  const slots = await slotsWithRoom(stalls);
  const stallsById: Record<string, CheckoutStall> = Object.fromEntries(
    stalls.map((stall) => [
      stall.id,
      {
        name: stall.name,
        openTime: stall.openTime,
        closeTime: stall.closeTime,
        paused: stall.paused,
        slots: stall.paused ? [] : (slots.get(stall.id) ?? []),
      },
    ]),
  );

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="employee" name={session?.name} right={<CartButton />} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <Button variant="ghost" size="sm" className="-ml-2 mb-3" render={<Link href="/stalls" />}>
          ← Back to stalls
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Pickup and pay</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose when you will reach each counter (campus time, IST). Every stall in your bag gives you its own
          token. Payment is mocked — nothing is charged.
        </p>
        <div className="mt-6">
          <CheckoutForm stalls={stallsById} />
        </div>
      </main>
    </div>
  );
}
