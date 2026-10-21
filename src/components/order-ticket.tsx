"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/cart-provider";
import { toast } from "sonner";
import { VegDot } from "@/components/veg-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cancelOwnOrder, rateOrder, reorderLines } from "@/lib/actions";
import { formatInr } from "@/lib/money";
import type { OrderStatusUpdate, OrderView } from "@/lib/order-view";
import { employeeCanCancel, isOpenStatus } from "@/lib/orders";
import { keepTicket } from "@/lib/offline-tickets";
import { announceReady, askToNotify, canNotify } from "@/lib/ready-alert";

export function OrderTicket({ initial }: { initial: OrderView }) {
  const [order, setOrder] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, startCancel] = useTransition();
  const [reordering, startReorder] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const router = useRouter();
  const { replace } = useCart();
  const [notify, setNotify] = useState<"unsupported" | "ask" | "on" | "blocked">("unsupported");
  const lastStatus = useRef(initial.status);
  // Bumped on the employee's own change, so a poll already in flight cannot undo it.
  const edits = useRef(0);
  const open = isOpenStatus(order.status);

  useEffect(() => {
    // Keep a copy for when the phone loses signal at the counter.
    if (process.env.NODE_ENV === "production") void keepTicket(initial.id);
  }, [initial.id]);

  useEffect(() => {
    if (!canNotify()) return;
    const permission = Notification.permission;
    // Reads browser state after hydration; the server cannot know it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNotify(permission === "granted" ? "on" : permission === "denied" ? "blocked" : "ask");
  }, []);

  useEffect(() => {
    // Collected and cancelled orders do not change any more.
    if (!open) return;
    let live = true;
    const timer = setInterval(async () => {
      const startedAt = edits.current;
      try {
        const res = await fetch(`/api/orders/${initial.id}`, { cache: "no-store" });
        if (!res.ok) {
          setError("Could not refresh this order.");
          return;
        }
        const data = (await res.json()) as OrderStatusUpdate;
        if (!live || edits.current !== startedAt) return;
        if (data.status === "READY" && lastStatus.current !== "READY") {
          announceReady(initial.token, initial.stallName);
        }
        lastStatus.current = data.status;
        setOrder((current) => ({ ...current, ...data }));
        setError(null);
      } catch {
        setError("You are offline. The token on screen is still valid.");
      }
    }, 3000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [initial.id, initial.stallName, initial.token, open]);

  useEffect(() => {
    const base = document.title;
    if (order.status === "READY") document.title = `Ready · ${order.token}`;
    return () => {
      document.title = base;
    };
  }, [order.status, order.token]);

  function cancel() {
    setConfirmCancel(false);
    startCancel(async () => {
      const result = await cancelOwnOrder(order.id);
      edits.current += 1;
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      lastStatus.current = "CANCELLED";
      const now = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date());
      setOrder((current) => ({
        ...current,
        status: "CANCELLED",
        statusLabel: "Cancelled",
        cancelNote: "You cancelled this order.",
        timeline: [...current.timeline.filter((step) => step.at), { label: "Cancelled", at: now }],
      }));
      toast.success("Order cancelled. The mock payment was refunded.");
    });
  }

  function orderAgain() {
    startReorder(async () => {
      const result = await reorderLines(order.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      replace(result.stall, result.lines);
      if (result.skipped.length) toast.info(`Left out (not available now): ${result.skipped.join(", ")}`);
      router.push("/checkout");
    });
  }

  const ready = order.status === "READY";
  const collected = order.status === "COLLECTED";
  const cancelled = order.status === "CANCELLED";
  const collectedAt = order.timeline.find((step) => step.label === "Collected")?.at;

  return (
    <div className="mx-auto max-w-md space-y-4" data-ticket-id={order.id}>
      <div
        className={`rounded-2xl border bg-card p-5 text-center shadow-sm ${
          ready ? "ring-2 ring-emerald-600" : ""
        }`}
      >
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
          {cancelled
            ? "Cancelled order"
            : collected
              ? `Collected${collectedAt ? ` at ${collectedAt}` : ""}`
              : "Show this at the counter"}
        </p>
        <h1 className={`mt-2 font-mono text-4xl font-semibold tracking-widest ${cancelled ? "text-muted-foreground line-through" : ""}`}>
          {order.token}
        </h1>
        {cancelled || collected ? null : (
          <div className="mt-4 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={order.qrDataUrl} alt={`QR for ${order.token}`} className="size-52 rounded-lg border bg-white p-2" />
          </div>
        )}
        <div className="mt-3" role="status" aria-live="polite">
          <Badge variant={ready ? "default" : collected || cancelled ? "secondary" : "outline"}>{order.statusLabel}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Pickup {order.pickupSlot} · {order.stallName}, {order.stallLocation}
        </p>
        <ol aria-label="Order progress" className="mx-auto mt-4 flex max-w-xs justify-between text-[11px]">
          {order.timeline.map((step) => (
            <li key={step.label} className="flex flex-1 flex-col items-center gap-1">
              <span
                aria-hidden
                className={`size-2.5 rounded-full ${
                  step.at ? (step.label === "Cancelled" ? "bg-destructive" : "bg-emerald-600") : "bg-muted ring-1 ring-border"
                }`}
              />
              <span className={step.at ? "font-medium" : "text-muted-foreground"}>{step.label}</span>
              <span className="tabular-nums text-muted-foreground">{step.at || "—"}</span>
            </li>
          ))}
        </ol>
        {ready ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
            Food is ready. Walk to {order.stallLocation} and show this token.
          </p>
        ) : null}
        {collected ? (
          <p className="mt-3 text-sm text-muted-foreground">This order was marked collected.</p>
        ) : null}
        {cancelled ? (
          <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm">
            {order.cancelNote} The mock {order.paymentLabel} payment of {formatInr(order.totalInr)} was refunded.
          </p>
        ) : null}
        {open && !ready && notify === "ask" ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={async () => setNotify((await askToNotify()) ? "on" : "blocked")}
          >
            Notify me when it is ready
          </Button>
        ) : null}
        {open && !ready && notify === "on" ? (
          <p className="mt-3 text-xs text-muted-foreground">We will notify you when it is ready.</p>
        ) : null}
        {employeeCanCancel(order.status) && !confirmCancel ? (
          <Button variant="ghost" size="sm" className="mt-2 text-destructive" disabled={cancelling} onClick={() => setConfirmCancel(true)}>
            {cancelling ? "Cancelling…" : "Cancel order"}
          </Button>
        ) : null}
        {employeeCanCancel(order.status) && confirmCancel ? (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p>Cancel {order.token}? The mock payment is refunded.</p>
            <div className="mt-2 flex justify-center gap-2">
              <Button size="sm" variant="destructive" disabled={cancelling} onClick={cancel}>
                Yes, cancel it
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(false)}>
                Keep order
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {collected && order.rating === null ? (
        <RateOrder orderId={order.id} stallName={order.stallName} onRated={(rating) => setOrder((o) => ({ ...o, rating }))} />
      ) : null}
      {order.rating !== null ? (
        <p className="text-center text-sm text-muted-foreground">
          You rated this {order.rating} out of 5. Thanks, it goes to {order.stallName}.
        </p>
      ) : null}

      <div className="rounded-xl border bg-card p-4">
        <h2 className="font-medium">Items</h2>
        {order.note ? <p className="mt-1 text-sm text-muted-foreground">Note: {order.note}</p> : null}
        <ul className="mt-2 space-y-2 text-sm">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <VegDot veg={item.veg} />
                {item.qty}× {item.name}
              </span>
              <span>{formatInr(item.priceInr * item.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t pt-3 text-sm">
          <span>
            {cancelled ? "Refunded to" : "Paid with"} {order.paymentLabel}
          </span>
          <span className="font-semibold">{formatInr(order.totalInr)}</span>
        </div>
        <p className="mt-2 flex justify-between text-xs text-muted-foreground">
          <span>Ref {order.paymentRef}</span>
          <Link href={`/orders/${order.id}/receipt`} className="font-medium underline underline-offset-4">
            Receipt
          </Link>
        </p>
      </div>

      {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" render={<Link href="/orders" />}>
          My orders
        </Button>
        <Button className="flex-1" disabled={reordering} onClick={orderAgain}>
          {reordering ? "Filling your bag…" : "Order again"}
        </Button>
      </div>
    </div>
  );
}

function RateOrder({
  orderId,
  stallName,
  onRated,
}: {
  orderId: string;
  stallName: string;
  onRated: (rating: number) => void;
}) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [hidden, setHidden] = useState(false);
  const [saving, startSaving] = useTransition();
  if (hidden) return null;

  return (
    <section aria-label="Rate this order" className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">How was it?</h2>
        <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setHidden(true)}>
          Not now
        </button>
      </div>
      <div role="radiogroup" aria-label="Stars" className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setStars(n)}
            className={`text-2xl leading-none ${n <= stars ? "text-amber-500" : "text-muted-foreground/40"}`}
          >
            ★
          </button>
        ))}
      </div>
      {stars ? (
        <>
          <label className="mt-3 block text-xs font-medium text-muted-foreground" htmlFor="rating-comment">
            {stars <= 2 ? `What went wrong? ${stallName} sees this.` : "Anything to add? (optional)"}
          </label>
          <textarea
            id="rating-comment"
            maxLength={280}
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm"
          />
          <Button
            className="mt-2"
            size="sm"
            disabled={saving}
            onClick={() =>
              startSaving(async () => {
                const result = await rateOrder(orderId, stars, comment);
                if (!result.ok) return void toast.error(result.error);
                onRated(stars);
              })
            }
          >
            {saving ? "Sending…" : "Send"}
          </Button>
        </>
      ) : null}
    </section>
  );
}
