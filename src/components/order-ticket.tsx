"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { VegDot } from "@/components/veg-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/money";
import type { OrderView } from "@/lib/order-view";

export function OrderTicket({ initial }: { initial: OrderView }) {
  const [order, setOrder] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/orders/${initial.id}`, { cache: "no-store" });
        if (!res.ok) {
          setError("Could not refresh this order.");
          return;
        }
        const data = (await res.json()) as OrderView;
        setOrder(data);
        setError(null);
      } catch {
        setError("You are offline. The token on screen is still valid.");
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [initial.id]);

  const ready = order.status === "READY";
  const collected = order.status === "COLLECTED";

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div
        className={`rounded-2xl border bg-card p-5 text-center shadow-sm ${
          ready ? "ring-2 ring-emerald-600" : ""
        }`}
      >
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase">Show this at the counter</p>
        <p className="mt-2 font-mono text-4xl font-semibold tracking-widest">{order.token}</p>
        <div className="mt-4 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={order.qrDataUrl} alt={`QR for ${order.token}`} className="size-52 rounded-lg border bg-white p-2" />
        </div>
        <div className="mt-3">
          <Badge variant={ready ? "default" : collected ? "secondary" : "outline"}>{order.statusLabel}</Badge>
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
