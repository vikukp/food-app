"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { VegDot } from "@/components/veg-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cancelOwnOrder } from "@/lib/actions";
import { formatInr } from "@/lib/money";
import type { OrderStatusUpdate, OrderView } from "@/lib/order-view";
import { employeeCanCancel, isOpenStatus } from "@/lib/orders";
import { announceReady, askToNotify, canNotify } from "@/lib/ready-alert";

export function OrderTicket({ initial }: { initial: OrderView }) {
  const [order, setOrder] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, startCancel] = useTransition();
  const [notify, setNotify] = useState<"unsupported" | "ask" | "on" | "blocked">("unsupported");
  const lastStatus = useRef(initial.status);
  const open = isOpenStatus(order.status);

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
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${initial.id}`, { cache: "no-store" });
        if (!res.ok) {
          setError("Could not refresh this order.");
          return;
        }
        const data = (await res.json()) as OrderStatusUpdate;
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
    return () => clearInterval(timer);
  }, [initial.id, initial.stallName, initial.token, open]);

  useEffect(() => {
    const base = document.title;
    if (order.status === "READY") document.title = `Ready · ${order.token}`;
    return () => {
      document.title = base;
    };
  }, [order.status, order.token]);

  function cancel() {
    if (!window.confirm("Cancel this order? The mock payment is refunded.")) return;
    startCancel(async () => {
      const result = await cancelOwnOrder(order.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      lastStatus.current = "CANCELLED";
      setOrder((current) => ({
        ...current,
        status: "CANCELLED",
        statusLabel: "Cancelled",
        cancelNote: "You cancelled this order.",
      }));
      toast.success("Order cancelled. The mock payment was refunded.");
    });
  }

  const ready = order.status === "READY";
  const collected = order.status === "COLLECTED";
  const cancelled = order.status === "CANCELLED";

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div
        className={`rounded-2xl border bg-card p-5 text-center shadow-sm ${
          ready ? "ring-2 ring-emerald-600" : ""
        }`}
      >
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">
          {cancelled ? "Cancelled order" : "Show this at the counter"}
        </p>
        <h1 className={`mt-2 font-mono text-4xl font-semibold tracking-widest ${cancelled ? "text-muted-foreground line-through" : ""}`}>
          {order.token}
        </h1>
        {cancelled ? null : (
          <div className="mt-4 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={order.qrDataUrl} alt={`QR for ${order.token}`} className="size-52 rounded-lg border bg-white p-2" />
          </div>
        )}
        <div className="mt-3" role="status" aria-live="polite">
          <Badge variant={ready ? "default" : collected || cancelled ? "secondary" : "outline"}>{order.statusLabel}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Pickup {order.pickupSlot} · {order.stallName}
        </p>
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
        {employeeCanCancel(order.status) ? (
          <Button variant="ghost" size="sm" className="mt-2 text-destructive" disabled={cancelling} onClick={cancel}>
            {cancelling ? "Cancelling…" : "Cancel order"}
          </Button>
        ) : null}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h2 className="font-medium">Items</h2>
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
          <span>Paid with {order.paymentLabel}</span>
          <span className="font-semibold">{formatInr(order.totalInr)}</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Ref {order.paymentRef}</p>
      </div>

      {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" render={<Link href="/orders" />}>
          My orders
        </Button>
        <Button className="flex-1" render={<Link href="/stalls" />}>
          Order again
        </Button>
      </div>
    </div>
  );
}
