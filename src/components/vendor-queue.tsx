"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { VegDot } from "@/components/veg-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { advanceVendorOrder } from "@/lib/actions";
import { formatInr } from "@/lib/money";
import { nextStatus, statusLabel, type OrderStatus } from "@/lib/orders";
import type { VendorOrder } from "@/lib/vendor-orders";

const TABS = ["active", "ready", "done"] as const;

export function VendorQueue({ initial }: { initial: VendorOrder[] }) {
  const [orders, setOrders] = useState(initial);
  const [tab, setTab] = useState<(typeof TABS)[number]>("active");
  const [pending, startTransition] = useTransition();
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/vendor/orders", { cache: "no-store" });
        if (!res.ok) {
          setLoadError("Could not refresh the queue.");
          return;
        }
        const data = (await res.json()) as VendorOrder[];
        setOrders(data);
        setLoadError(null);
      } catch {
        setLoadError("Queue will catch up when the network is back.");
      }
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const visible = orders.filter((order) => {
    if (tab === "active") return order.status === "PLACED" || order.status === "PREPARING";
    if (tab === "ready") return order.status === "READY";
    return order.status === "COLLECTED";
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`h-9 rounded-lg px-3 text-sm font-medium capitalize ${
              tab === id ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-border"
            }`}
          >
            {id}
          </button>
        ))}
      </div>

      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center">
          <p className="font-medium">
            {tab === "active"
              ? "No orders to cook right now."
              : tab === "ready"
                ? "Nothing waiting on the counter."
                : "No collected orders in this window yet."}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            New employee orders appear here within a few seconds.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((order) => {
            const next = nextStatus(order.status as OrderStatus);
            return (
              <li key={order.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-xl font-semibold tracking-wide">{order.token}</p>
                    <p className="text-sm text-muted-foreground">
                      Pickup {order.pickupSlot} · {order.employeeName}
                    </p>
                  </div>
                  <Badge variant="outline">{statusLabel(order.status)}</Badge>
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-2">
                      <VegDot veg={item.veg} />
                      <span>
                        {item.qty}× {item.name}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    {order.paymentLabel} · {formatInr(order.totalInr)}
                  </p>
                  {next ? (
                    <Button
                      disabled={pending}
                      onClick={() => {
                        startTransition(async () => {
                          const result = await advanceVendorOrder(order.id);
                          if (!result.ok) {
                            toast.error(result.error);
                            return;
                          }
                          setOrders((current) =>
                            current.map((o) => (o.id === order.id ? { ...o, status: next } : o)),
                          );
                          toast.success(statusLabel(next));
                        });
                      }}
                    >
                      {next === "PREPARING"
                        ? "Start preparing"
                        : next === "READY"
                          ? "Mark ready"
                          : "Mark collected"}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
