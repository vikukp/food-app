"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { useCart } from "@/components/cart-provider";
import { VegDot } from "@/components/veg-dot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { placeOrder } from "@/lib/actions";
import { hoursLabel } from "@/lib/hours";
import { formatInr } from "@/lib/money";
import type { PickupSlot } from "@/lib/pickup-slots";

const PLUXEE_BALANCE = 2400;

export type CheckoutStall = {
  name: string;
  openTime: string;
  closeTime: string;
  slots: PickupSlot[];
};

export function CheckoutForm({ stalls }: { stalls: Record<string, CheckoutStall> }) {
  const router = useRouter();
  const { cart, total, setQty, setPrices, clear, hydrated } = useCart();
  const [chosenSlot, setChosenSlot] = useState("");
  const [method, setMethod] = useState<"PLUXEE" | "UPI" | "CARD">("PLUXEE");
  const [upiId, setUpiId] = useState("priya.nair@okaxis");
  const [cardName, setCardName] = useState("Priya Nair");
  const [cardNumber, setCardNumber] = useState("4242 4242 4242 4242");
  const [submitting, setSubmitting] = useState(false);

  const stall = cart.stallId ? stalls[cart.stallId] : undefined;
  const slots = stall?.slots ?? [];
  const pickupSlot = slots.some((slot) => slot.value === chosenSlot)
    ? chosenSlot
    : (slots[0]?.value ?? "");

  if (!hydrated) {
    return <p className="text-sm text-muted-foreground">Loading your bag…</p>;
  }

  if (!cart.items.length || !cart.stallId) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-8 text-center">
        <p className="font-medium">Your bag is empty.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Add lunch from a stall, then come back to pick a time and pay.
        </p>
        <Button className="mt-4" render={<Link href="/stalls" />}>
          Browse stalls
        </Button>
      </div>
    );
  }

  if (!stall || !slots.length) {
    return (
      <div className="rounded-xl border bg-card p-6">
        <p className="font-medium">{cart.stallName} is not taking orders right now.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {stall
            ? `Counter hours are ${hoursLabel(stall.openTime, stall.closeTime)} (IST). Pick a stall that is open now, or come back at ${stall.openTime}.`
            : "That stall is not on the court today."}
        </p>
        <Button className="mt-4" render={<Link href="/stalls" />}>
          See open stalls
        </Button>
      </div>
    );
  }

  async function pay() {
    if (!pickupSlot) {
      toast.error("Choose a pickup time.");
      return;
    }
    if (method === "UPI" && !upiId.includes("@")) {
      toast.error("Enter a UPI ID like name@bank.");
      return;
    }
    if (method === "CARD" && cardNumber.replace(/\s/g, "").length < 12) {
      toast.error("Enter the mock card number.");
      return;
    }
    setSubmitting(true);
    toast.loading("Charging mock payment…", { id: "pay" });
    try {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const result = await placeOrder({
        stallId: cart.stallId!,
        pickupSlot,
        paymentMethod: method,
        items: cart.items.map((item) => ({ menuItemId: item.menuItemId, qty: item.qty })),
        expectedTotalInr: total,
      });
      if (!result.ok) {
        if (result.prices) setPrices(result.prices);
        toast.error(result.error, { id: "pay" });
        setSubmitting(false);
        return;
      }
      toast.success("Paid. Token is ready.", { id: "pay" });
      clear();
      router.push(`/orders/${result.orderId}`);
    } catch {
      toast.error("Could not reach the food court. Check My orders before you try again.", { id: "pay" });
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="font-medium">Pickup time</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tell {cart.stallName} when you will be at the counter. They cook to that slot.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((slot) => (
              <button
                key={slot.value}
                type="button"
                onClick={() => setChosenSlot(slot.value)}
                className={`h-10 rounded-lg border text-sm font-medium ${
                  pickupSlot === slot.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background"
                }`}
              >
                {slot.label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="font-medium">Pay (mock)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No real Pluxee, UPI, or card charge. This is a campus demo checkout.
          </p>
          <div className="mt-3 grid gap-2">
            <PayMethod
              selected={method === "PLUXEE"}
              onSelect={() => setMethod("PLUXEE")}
              title="Pluxee"
              subtitle={`Meal card · balance ${formatInr(PLUXEE_BALANCE)}`}
            />
            <PayMethod
              selected={method === "UPI"}
              onSelect={() => setMethod("UPI")}
              title="UPI"
              subtitle="GPay / PhonePe / BHIM style sheet"
            />
            <PayMethod
              selected={method === "CARD"}
              onSelect={() => setMethod("CARD")}
              title="Card"
              subtitle="Visa / Mastercard mock"
            />
          </div>

          {method === "PLUXEE" ? (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
              After this order, mock Pluxee balance will show{" "}
              {formatInr(PLUXEE_BALANCE - total)}.
            </p>
          ) : null}

          {method === "UPI" ? (
            <div className="mt-3 space-y-2">
              <Label htmlFor="upi">UPI ID</Label>
              <Input id="upi" className="h-10" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
            </div>
          ) : null}

          {method === "CARD" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="cardName">Name on card</Label>
                <Input id="cardName" className="h-10" value={cardName} onChange={(e) => setCardName(e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="cardNumber">Card number</Label>
                <Input
                  id="cardNumber"
                  className="h-10"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                />
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <aside className="h-fit rounded-xl border bg-card p-4 lg:sticky lg:top-20">
        <h2 className="font-medium">{cart.stallName}</h2>
        <ul className="mt-3 space-y-2">
          {cart.items.map((item) => (
            <li key={item.menuItemId} className="flex items-start justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <VegDot veg={item.veg} />
                <span className="truncate">
                  {item.qty}× {item.name}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs">
                <span>{formatInr(item.priceInr * item.qty)}</span>
                <button
                  type="button"
                  className="text-muted-foreground underline"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => setQty(item.menuItemId, 0)}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">To pay</span>
          <span className="text-base font-semibold">{formatInr(total)}</span>
        </div>
        <Button className="mt-4 h-11 w-full" disabled={submitting} onClick={pay}>
          {submitting ? "Paying…" : `Pay ${formatInr(total)}`}
        </Button>
      </aside>
    </div>
  );
}

function PayMethod({
  selected,
  onSelect,
  title,
  subtitle,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-lg border px-3 py-2 text-left ${
        selected ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </button>
  );
}
