"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { VegDot } from "@/components/veg-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { advanceVendorOrder, cancelVendorOrder, type ActionResult } from "@/lib/actions";
import { formatInr } from "@/lib/money";
import { STALL_CANCEL_REASONS, nextStatus, stallCanCancel, statusLabel, type OrderStatus } from "@/lib/orders";
import type { VendorOrder } from "@/lib/vendor-orders";

const TABS = ["active", "ready", "done"] as const;

export function VendorQueue({ initial }: { initial: VendorOrder[] }) {
  const [orders, setOrders] = useState(initial);
  const [tab, setTab] = useState<(typeof TABS)[number]>("active");
  const [pending, startTransition] = useTransition();
  const [loadError, setLoadError] = useState<string | null>(null);
  // The order whose "Cancel" was tapped, so its reason picker is showing.
  const [cancelFor, setCancelFor] = useState<string | null>(null);
  // Bumped on every local status change, so a poll that started before it
  // cannot land afterwards and bring back the old button.
  const edits = useRef(0);

  const refresh = useCallback(async () => {
    const startedAt = edits.current;
    try {
      // "no-cache" revalidates with the ETag: an unchanged queue comes back as a
      // 304 that the browser answers from its copy.
      const res = await fetch("/api/vendor/orders", { cache: "no-cache" });
      if (!res.ok) {
        setLoadError("Could not refresh the queue.");
        return;
      }
      const data = (await res.json()) as VendorOrder[];
      if (edits.current !== startedAt) return;
      setOrders(data);
      setLoadError(null);
    } catch {
      setLoadError("Queue will catch up when the network is back.");
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  const visible = orders.filter((order) => {
    if (tab === "active") return order.status === "PLACED" || order.status === "PREPARING";
    if (tab === "ready") return order.status === "READY";
    return order.status === "COLLECTED" || order.status === "CANCELLED";
  });

  function change(order: VendorOrder, patch: Partial<VendorOrder>, run: () => Promise<ActionResult>, done: string) {
    startTransition(async () => {
      const result = await run();
      edits.current += 1;
      if (!result.ok) {
        toast.error(result.error);
        await refresh();
        return;
      }
      setOrders((current) => current.map((o) => (o.id === order.id ? { ...o, ...patch } : o)));
      setCancelFor(null);
      toast.success(done);
    });
  }

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
                : "No collected or cancelled orders yet."}
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
                  <Badge variant={order.status === "CANCELLED" ? "secondary" : "outline"}>
                    {statusLabel(order.status)}
                  </Badge>
                </div>
                {order.status === "CANCELLED" && order.cancelReason ? (
                  <p className="mt-1 text-xs text-muted-foreground">{order.cancelReason}</p>
                ) : null}
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
                  <div className="flex items-center gap-2">
                    {stallCanCancel(order.status) && cancelFor !== order.id ? (
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setCancelFor(order.id)}>
                        Cancel
                      </Button>
                    ) : null}
                    {next && cancelFor !== order.id ? (
                      <Button
                        disabled={pending}
                        onClick={() =>
                          change(order, { status: next }, () => advanceVendorOrder(order.id, order.status), statusLabel(next))
                        }
                      >
                        {next === "PREPARING"
                          ? "Start preparing"
                          : next === "READY"
                            ? "Mark ready"
                            : "Mark collected"}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {cancelFor === order.id ? (
                  <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-sm font-medium">Cancel {order.token}? The employee is refunded and told why:</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {STALL_CANCEL_REASONS.map((reason) => (
                        <Button
                          key={reason}
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            change(
                              order,
                              { status: "CANCELLED", cancelReason: reason },
                              () => cancelVendorOrder(order.id, order.status, reason),
                              `${order.token} cancelled`,
                            )
                          }
                        >
                          {reason}
                        </Button>
                      ))}
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => setCancelFor(null)}>
                        Keep order
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
