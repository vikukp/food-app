"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { QrScanner, useCanScan } from "@/components/qr-scanner";
import { VegDot } from "@/components/veg-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { advanceVendorOrder, cancelVendorOrder, lookupVendorOrder, type ActionResult } from "@/lib/actions";
import { formatInr } from "@/lib/money";
import { STALL_CANCEL_REASONS, nextStatus, stallCanCancel, statusLabel, type OrderStatus } from "@/lib/orders";
import type { VendorDaySummary, VendorOrder, VendorQueueSnapshot } from "@/lib/vendor-orders";

const TABS = ["active", "ready", "done"] as const;

export function VendorQueue({ initial }: { initial: VendorQueueSnapshot }) {
  const [orders, setOrders] = useState(initial.orders);
  const [summary, setSummary] = useState(initial.summary);
  // Digits typed into "Find token": filters every tab at once.
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const canScan = useCanScan();
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
      const data = (await res.json()) as VendorQueueSnapshot;
      if (edits.current !== startedAt) return;
      // A looked-up order from earlier today stays on screen until the search is cleared.
      setOrders((current) => {
        const ids = new Set(data.orders.map((o) => o.id));
        return [...data.orders, ...current.filter((o) => o.found && !ids.has(o.id))];
      });
      setSummary(data.summary);
      setLoadError(null);
    } catch {
      setLoadError("Queue will catch up when the network is back.");
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  const digits = query.replace(/\D/g, "");
  const visible = orders.filter((order) => {
    if (digits) return order.token.includes(digits);
    if (tab === "active") return order.status === "PLACED" || order.status === "PREPARING";
    if (tab === "ready") return order.status === "READY";
    return order.status === "COLLECTED" || order.status === "CANCELLED";
  });

  const find = useCallback(
    (value: string) => {
      setScanning(false);
      startTransition(async () => {
        const result = await lookupVendorOrder(value);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        const found = { ...result.order, found: true };
        edits.current += 1;
        setOrders((current) =>
          current.some((o) => o.id === found.id)
            ? current.map((o) => (o.id === found.id ? { ...found, found: o.found } : o))
            : [...current, found],
        );
        setQuery(found.token.replace("IWF-", ""));
      });
    },
    [],
  );

  // Orders pulled in by a lookup go away with the search; the poll keeps the rest.
  function clearSearch() {
    setQuery("");
    setOrders((current) => current.filter((o) => !o.found));
  }

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
      <DaySummary summary={summary} />

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (digits.length === 4) find(digits);
        }}
      >
        <Input
          aria-label="Find token"
          placeholder="Find token, e.g. 4821"
          inputMode="numeric"
          className="h-9"
          value={query}
          onChange={(event) => setQuery(event.target.value.slice(0, 12))}
        />
        {query ? (
          <Button type="button" variant="ghost" onClick={clearSearch}>
            Clear
          </Button>
        ) : null}
        <Button type="submit" variant="outline" disabled={pending || digits.length !== 4}>
          Find
        </Button>
        {canScan ? (
          <Button type="button" variant="outline" onClick={() => setScanning((on) => !on)}>
            Scan QR
          </Button>
        ) : null}
      </form>
      {scanning ? <QrScanner onResult={find} onClose={() => setScanning(false)} /> : null}

      <div className="flex gap-2">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              clearSearch();
            }}
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
            {digits
              ? `No order with ${digits} in the queue. Press Find to look it up.`
              : tab === "active"
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

function DaySummary({ summary }: { summary: VendorDaySummary }) {
  return (
    <section aria-label="Today" className="grid grid-cols-3 gap-2 rounded-xl border bg-card p-3 text-center">
      <div>
        <p className="text-xl font-semibold tabular-nums">{summary.orders}</p>
        <p className="text-xs text-muted-foreground">orders today</p>
      </div>
      <div>
        <p className="text-xl font-semibold tabular-nums">{formatInr(summary.revenueInr)}</p>
        <p className="text-xs text-muted-foreground">taken today</p>
      </div>
      <div>
        <p className="text-xl font-semibold tabular-nums">{summary.cancelled}</p>
        <p className="text-xs text-muted-foreground">cancelled</p>
      </div>
      {summary.topItems.length ? (
        <p className="col-span-3 border-t pt-2 text-left text-xs text-muted-foreground">
          Top today: {summary.topItems.map((item) => `${item.name} ×${item.qty}`).join(" · ")}
        </p>
      ) : null}
    </section>
  );
}
