"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { useCart } from "@/components/cart-provider";
import { QtyStepper } from "@/components/qty-stepper";
import { VegDot } from "@/components/veg-dot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkBag, placeOrder, type BagCheck } from "@/lib/actions";
import { cartLines, stallTotal } from "@/lib/cart";
import { hoursLabel } from "@/lib/hours";
import { formatInr } from "@/lib/money";
import type { PickupSlot } from "@/lib/pickup-slots";

export type CheckoutStall = {
  name: string;
  openTime: string;
  closeTime: string;
  paused: boolean;
  slots: PickupSlot[];
};

type Method = "PLUXEE" | "UPI" | "CARD";

export function CheckoutForm({ stalls }: { stalls: Record<string, CheckoutStall> }) {
  const router = useRouter();
  const { cart, total, setQty, setPrices, removeStall, clear, hydrated } = useCart();
  const [chosenSlots, setChosenSlots] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<Method>("PLUXEE");
  const [upiId, setUpiId] = useState("priya.nair@okaxis");
  const [cardName, setCardName] = useState("Priya Nair");
  const [cardNumber, setCardNumber] = useState("4242 4242 4242 4242");
  const [submitting, setSubmitting] = useState(false);
  const [bagCheck, setBagCheck] = useState<BagCheck>({});
  const lineKey = cartLines(cart)
    .map((item) => item.menuItemId)
    .join(",");
  // The stall whose part the last payment attempt failed on, and why. Shown
  // until that stall gets a new slot or the bag's lines change.
  const [problem, setProblem] = useState<{ stallId: string; error: string; lineKey: string } | null>(null);

  // Look the bag up against today's menus once it has loaded from storage.
  useEffect(() => {
    if (!hydrated || !lineKey) return;
    let live = true;
    checkBag(lineKey.split(","))
      .then((result) => {
        if (!live) return;
        setBagCheck(result);
        const changed = Object.fromEntries(
          Object.entries(result).flatMap(([id, line]) => (line.priceInr !== undefined ? [[id, line.priceInr]] : [])),
        );
        const moved = cartLines(cart).some(
          (item) => changed[item.menuItemId] !== undefined && changed[item.menuItemId] !== item.priceInr,
        );
        if (moved) {
          setPrices(changed);
          toast.info("Some prices changed since you added them. The total is up to date.");
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // Only when the set of lines changes, not on every quantity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, lineKey]);

  const parts = cart.stalls.map((bagStall) => {
    const stall = stalls[bagStall.id];
    const slots = stall?.slots ?? [];
    const open = slots.filter((slot) => !slot.full);
    const chosen = chosenSlots[bagStall.id];
    return {
      bagStall,
      stall,
      slots,
      pickupSlot: open.some((slot) => slot.value === chosen) ? chosen : (open[0]?.value ?? ""),
      unavailable: bagStall.items.filter(
        (item) => bagCheck[item.menuItemId] && bagCheck[item.menuItemId].state !== "ok",
      ),
      closed: !stall
        ? "That stall is not on the court today."
        : stall.paused
          ? "The stall has paused new orders for a while. Your bag is saved; try again soon."
          : !slots.length
            ? `Counter hours are ${hoursLabel(stall.openTime, stall.closeTime)} (IST). Come back at ${stall.openTime}, or pick a stall that is open now.`
            : !open.length
              ? "Every pickup slot for the next few hours is full. Try again in a little while, or pick another stall."
              : null,
    };
  });
  const closedStalls = parts.filter((part) => part.closed);
  const unavailable = parts.flatMap((part) => part.unavailable);

  if (!hydrated) {
    return <p className="text-sm text-muted-foreground">Loading your bag…</p>;
  }

  if (!parts.length) {
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

  function chooseSlot(stallId: string, value: string) {
    setChosenSlots((current) => ({ ...current, [stallId]: value }));
    setProblem((current) => (current?.stallId === stallId ? null : current));
  }

  async function pay() {
    if (closedStalls.length || unavailable.length) return;
    if (method === "UPI" && !upiId.includes("@")) {
      toast.error("Enter a UPI ID like name@bank.");
      return;
    }
    if (method === "CARD" && cardNumber.replace(/\s/g, "").length < 12) {
      toast.error("Enter the mock card number.");
      return;
    }
    setSubmitting(true);
    setProblem(null);
    toast.loading("Charging mock payment…", { id: "pay" });
    try {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const result = await placeOrder({
        paymentMethod: method,
        stalls: parts.map(({ bagStall, pickupSlot }) => ({
          stallId: bagStall.id,
          pickupSlot,
          items: bagStall.items.map((item) => ({ menuItemId: item.menuItemId, qty: item.qty })),
          expectedTotalInr: stallTotal(bagStall),
          note: notes[bagStall.id] ?? "",
        })),
      });
      if (!result.ok) {
        if (result.prices) setPrices(result.prices);
        if (result.stallId) {
          setProblem({ stallId: result.stallId, error: result.error, lineKey });
          // Fetch the stalls' slots and pauses again: a full slot shows as full.
          router.refresh();
        }
        toast.error(result.error, { id: "pay" });
        setSubmitting(false);
        return;
      }
      const tokens = result.orderIds.length;
      toast.success(tokens > 1 ? `Paid. ${tokens} tokens are ready, one for each stall.` : "Paid. Token is ready.", {
        id: "pay",
      });
      clear();
      router.push(`/orders/${result.orderIds[0]}`);
    } catch {
      toast.error("Could not reach the food court. Check My orders before you try again.", { id: "pay" });
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        {parts.map(({ bagStall, slots, pickupSlot, closed }) => (
          <section
            key={bagStall.id}
            aria-labelledby={`stall-${bagStall.id}`}
            className="rounded-xl border bg-card p-4"
          >
            <h2 id={`stall-${bagStall.id}`} className="flex items-baseline justify-between gap-2 font-medium">
              <span className="break-words">{bagStall.name}</span>
              <span className="shrink-0 text-sm tabular-nums">{formatInr(stallTotal(bagStall))}</span>
            </h2>
            <ul className="mt-3 space-y-3">
              {bagStall.items.map((item) => {
                const state = bagCheck[item.menuItemId]?.state;
                return (
                  <li key={item.menuItemId} className="text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 items-start gap-2">
                        <VegDot veg={item.veg} className="mt-0.5" />
                        <span
                          className={`break-words ${state && state !== "ok" ? "text-muted-foreground line-through" : ""}`}
                        >
                          {item.name}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">{formatInr(item.priceInr * item.qty)}</span>
                    </div>
                    {state && state !== "ok" ? (
                      <p className="mt-1 flex items-center justify-between gap-2 text-xs text-destructive">
                        {state === "soldout" ? "Sold out now" : "No longer on the menu"}
                        <button
                          type="button"
                          className="font-medium underline"
                          onClick={() => setQty(item.menuItemId, 0)}
                        >
                          Remove
                        </button>
                      </p>
                    ) : (
                      <div className="mt-1 flex justify-end">
                        <QtyStepper menuItemId={item.menuItemId} name={item.name} qty={item.qty} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {closed ? (
              <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <p className="font-medium">{bagStall.name} is not taking orders right now.</p>
                <p className="mt-1">{closed}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="bg-background" onClick={() => removeStall(bagStall.id)}>
                    Remove from bag
                  </Button>
                  <Button size="sm" variant="ghost" render={<Link href="/stalls" />}>
                    See open stalls
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <h3 className="mt-5 text-sm font-medium">Pickup time</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  When you will be at the {bagStall.name} counter. They cook to that slot.
                </p>
                <div
                  role="group"
                  aria-label={`Pickup time at ${bagStall.name}`}
                  className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4"
                >
                  {slots.map((slot) => (
                    <button
                      key={slot.value}
                      type="button"
                      disabled={slot.full}
                      aria-pressed={pickupSlot === slot.value}
                      aria-label={slot.full ? `${slot.label}, full` : slot.label}
                      onClick={() => chooseSlot(bagStall.id, slot.value)}
                      className={`flex h-12 flex-col items-center justify-center rounded-lg border text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45 ${
                        pickupSlot === slot.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background"
                      }`}
                    >
                      <span>{slot.label}</span>
                      {slot.full ? (
                        <span className="text-[11px] font-normal">Full</span>
                      ) : slot.left !== undefined && slot.left <= 3 ? (
                        <span className="text-[11px] font-normal">{slot.left} left</span>
                      ) : null}
                    </button>
                  ))}
                </div>
                <Label htmlFor={`note-${bagStall.id}`} className="mt-5 font-medium">
                  Note for the kitchen (optional)
                </Label>
                <Input
                  id={`note-${bagStall.id}`}
                  className="mt-2 h-10"
                  maxLength={120}
                  placeholder="Less spicy, no onion, extra chutney…"
                  value={notes[bagStall.id] ?? ""}
                  onChange={(e) => setNotes((current) => ({ ...current, [bagStall.id]: e.target.value }))}
                />
              </>
            )}
            {problem?.stallId === bagStall.id && problem.lineKey === lineKey ? (
              <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-red-900">
                {problem.error}
              </p>
            ) : null}
          </section>
        ))}

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
              subtitle="Meal card"
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
              {formatInr(total)} will be charged to your Pluxee meal card. (Mock: no card is charged and no balance is
              checked in this demo.)
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
        <h2 className="font-medium">{parts.length > 1 ? `${parts.length} stalls, one payment` : "Your order"}</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {parts.map(({ bagStall, pickupSlot, closed }) => {
            const count = bagStall.items.reduce((sum, item) => sum + item.qty, 0);
            return (
              <li key={bagStall.id} className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-medium break-words">{bagStall.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {count} item{count === 1 ? "" : "s"} · {closed ? "not taking orders" : `pickup ${pickupSlot}`}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatInr(stallTotal(bagStall))}</span>
              </li>
            );
          })}
        </ul>
        {closedStalls.length ? (
          <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-red-900">
            {parts.length > 1
              ? `Remove ${closedStalls.map((part) => part.bagStall.name).join(" and ")} from your bag to pay for the rest, or try again later.`
              : "This stall cannot take your order right now. Your bag is saved."}
          </p>
        ) : unavailable.length ? (
          <p role="alert" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-red-900">
            Remove the items marked sold out or no longer on the menu to pay. The stall cannot make them right now.
          </p>
        ) : null}
        <div className="mt-4 flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">To pay</span>
          <span className="text-base font-semibold">{formatInr(total)}</span>
        </div>
        <Button
          className="mt-4 h-11 w-full"
          disabled={submitting || closedStalls.length > 0 || unavailable.length > 0}
          onClick={pay}
        >
          {submitting ? "Paying…" : `Pay ${formatInr(total)}`}
        </Button>
        {parts.length > 1 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            You get a token for each stall. Collect each one at its own counter.
          </p>
        ) : null}
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
      aria-pressed={selected}
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
