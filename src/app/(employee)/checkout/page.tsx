import { CartButton } from "@/components/cart-sheet";
import { CheckoutForm, type CheckoutStall } from "@/components/checkout-form";
import { SiteHeader } from "@/components/site-header";
import { getPickupSlots } from "@/lib/pickup-slots";
import { prisma } from "@/lib/prisma";
import { getEmployeeSession } from "@/lib/session";

export const metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const session = await getEmployeeSession();
  const stalls = await prisma.stall.findMany({
    select: { id: true, name: true, openTime: true, closeTime: true },
  });
  const stallsById: Record<string, CheckoutStall> = Object.fromEntries(
    stalls.map((stall) => [
      stall.id,
      {
        name: stall.name,
        openTime: stall.openTime,
        closeTime: stall.closeTime,
        slots: getPickupSlots(stall.openTime, stall.closeTime),
      },
    ]),
  );

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader variant="employee" name={session?.name} right={<CartButton />} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Pickup and pay</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose when you will reach the stall (campus time, IST). Payment is mocked — nothing is
          charged.
        </p>
        <div className="mt-6">
          <CheckoutForm stalls={stallsById} />
        </div>
      </main>
    </div>
  );
}
