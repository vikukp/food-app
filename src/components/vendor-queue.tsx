"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { SoundPrompt, useScreenAwake } from "@/components/counter-tablet";
import { QrScanner, useCanScan, useScannerGun } from "@/components/qr-scanner";
import { VegDot } from "@/components/veg-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { advanceVendorOrder, cancelVendorOrder, lookupVendorOrder, type ActionResult } from "@/lib/actions";
import { ticketCheck } from "@/lib/handover";
import { QR_PREFIX, ticketTextIn } from "@/lib/qr-format";
import { campusClockTime } from "@/lib/hours";
import { START_BEFORE_PICKUP_MS, dueToStart, fromNow, minutesLate, slotGroups, type SlotGroup } from "@/lib/kitchen-slots";
import { formatInr } from "@/lib/money";
import { NO_SHOW_AFTER_MS, cancelReasonsFor, nextStatus, statusLabel, type OrderStatus } from "@/lib/orders";
import { chime } from "@/lib/ready-alert";
import type { VendorDaySummary, VendorOrder, VendorQueueSnapshot } from "@/lib/vendor-orders";

const TABS = ["active", "ready", "done"] as const;
// Food left on the counter this long gets a nudge to call the token out.
const UNCOLLECTED_MS = 15 * 60_000;
// After a tap the card's buttons rest this long, so a double tap on "Mark
// ready" does not land on the "Mark collected" that replaces it.
const TAP_COOLDOWN_MS = 1200;
// Cards side by side on a tablet.
const CARDS = "grid gap-3 md:grid-cols-2";

export function VendorQueue({ initial }: { initial: VendorQueueSnapshot }) {
  const [orders, setOrders] = useState(initial.orders);
  const [summary, setSummary] = useState(initial.summary);
  // Digits typed into "Find token": filters every tab at once.
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const canScan = useCanScan();
  // The ticket last scanned or typed in, and how: its card says whether to
  // hand it over (see lib/handover.ts).
  const [checked, setChecked] = useState<{ id: string; by: "scan" | "typed" } | null>(null);
  useScreenAwake();
  // Client clock for "waiting at the counter" and for calling orders due to
  // start; null until mounted so the server render matches.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  const [tab, setTab] = useState<(typeof TABS)[number]>("active");
  const [pending, startTransition] = useTransition();
  const [loadError, setLoadError] = useState<string | null>(null);
  // The order whose "Cancel" was tapped, so its reason picker is showing.
  const [cancelFor, setCancelFor] = useState<string | null>(null);
  const [cooling, setCooling] = useState<ReadonlySet<string>>(new Set());
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

  // A chime and a note when an order is due to start: a pre-order 20 minutes
  // before its pickup, or a new order that is due straight away. Orders that
  // are already due when the screen opens are only shown.
  const called = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (now === null) return;
    const due = dueToStart(
      orders.filter((order) => !order.found),
      now,
    );
    if (!called.current) {
      called.current = new Set(due.map((order) => order.id));
      return;
    }
    const fresh = due.filter((order) => !called.current!.has(order.id));
    if (!fresh.length) return;
    for (const order of fresh) called.current.add(order.id);
    chime();
    toast.info(`Time to start ${fresh.map((order) => order.token).join(", ")}`, {
      description: `Pickup ${[...new Set(fresh.map((order) => order.pickupSlot))].join(", ")}`,
      duration: 15_000,
    });
  }, [orders, now]);

  // A scanner gun typing a ticket into the box is not a token search.
  const digits = query.includes("|") ? "" : query.replace(/\D/g, "");
  const counts = {
    active: orders.filter((o) => o.status === "PLACED" || o.status === "PREPARING").length,
    ready: orders.filter((o) => o.status === "READY").length,
    done: orders.filter((o) => o.status === "COLLECTED" || o.status === "CANCELLED").length,
  };
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
        toast.dismiss();
        const found = { ...result.order, found: true };
        const by = value.startsWith(`${QR_PREFIX}|`) ? "scan" : "typed";
        setChecked({ id: found.id, by });
        if (ticketCheck(found, by)?.level === "stop") chime("wrong");
        edits.current += 1;
        setOrders((current) =>
          current.some((o) => o.id === found.id)
            ? current.map((o) => (o.id === found.id ? { ...found, found: o.found } : o))
            : [...current, found],
        );
        setQuery(found.token.replace("T-", ""));
      });
    },
    [],
  );

  // What the camera or a scanner gun read: a ticket is looked up, anything
  // else (another QR or barcode) is turned away here.
  const read = useCallback(
    (text: string) => {
      const ticket = ticketTextIn(text);
      if (ticket) return find(ticket);
      setScanning(false);
      chime("wrong");
      toast.error("That code is not a ticket from this food court.");
    },
    [find],
  );
  useScannerGun(read);

  // Orders pulled in by a lookup go away with the search; the poll keeps the rest.
  function clearSearch() {
    setQuery("");
    setChecked(null);
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
      // Handed over (or turned down) here: no warning about it on its card.
      setChecked((ticket) => (ticket?.id === order.id ? null : ticket));
      setCancelFor(null);
      toast.success(done);
      setCooling((ids) => new Set(ids).add(order.id));
      setTimeout(
        () =>
          setCooling((ids) => {
            const left = new Set(ids);
            left.delete(order.id);
            return left;
          }),
        TAP_COOLDOWN_MS,
      );
    });
  }

  const card = (order: VendorOrder) => {
    const next = nextStatus(order.status as OrderStatus);
    const late =
      (order.status === "PLACED" || order.status === "PREPARING") && now !== null
        ? minutesLate(order.pickupSlot, now)
        : 0;
    const resting = pending || cooling.has(order.id);
    const noShowTooSoon =
      order.status === "READY" &&
      (now === null || !order.readyAt || now - Date.parse(order.readyAt) < NO_SHOW_AFTER_MS);
    const reasons = noShowTooSoon ? [] : cancelReasonsFor(order.status);
    const check = checked?.id === order.id ? ticketCheck(order, checked.by, now ?? undefined) : null;
    return (
      <li key={order.id} className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-mono text-xl font-semibold tracking-wide">{order.token}</p>
            <p className="text-sm text-muted-foreground">
              Pickup {order.pickupSlot} · {order.employeeName}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {late > 5 ? <Badge variant="destructive">Late {late} min</Badge> : null}
            <Badge variant={order.status === "CANCELLED" ? "secondary" : "outline"}>
              {statusLabel(order.status)}
            </Badge>
          </div>
        </div>
        {order.status === "READY" && order.readyAt && now !== null && now - Date.parse(order.readyAt) > UNCOLLECTED_MS ? (
          <p role="status" className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-950">
            Ready {Math.floor((now - Date.parse(order.readyAt)) / 60_000)} min and not collected. Call out{" "}
            {order.token}.
          </p>
        ) : null}
        {check ? (
          <p
            role={check.level === "stop" ? "alert" : "status"}
            className={`mt-2 rounded-md px-2 py-1.5 text-sm font-medium ${
              check.level === "stop" ? "bg-red-700 text-white" : "bg-amber-50 text-amber-950"
            }`}
          >
            {check.text}
          </p>
        ) : null}
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
        {order.note ? (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-sm text-amber-950">
            <span className="font-medium">Note:</span> {order.note}
          </p>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">
          {order.paymentLabel} · {formatInr(order.totalInr)}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          {/* Cancel sits away from the main button, on the other side of the card. */}
          {reasons.length && cancelFor !== order.id ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={resting}
              onClick={() => setCancelFor(order.id)}
            >
              {order.status === "READY" ? "Cancel (no-show)" : "Cancel"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {next && cancelFor !== order.id ? (
              <Button
                disabled={resting}
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
              {reasons.map((reason) => (
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
  };

  // One pickup slot: its time, when to start it, every dish it needs, then its orders.
  const slotSection = (group: SlotGroup, at: number, Heading: "h2" | "h3") => (
    <section key={group.dueAt} aria-label={`Pickup ${group.slot}`} className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <Heading className="font-semibold">
          Pickup {group.slot}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ·{" "}
            {group.later
              ? `start at ${campusClockTime(new Date(group.startAt))}, ${fromNow(group.startAt, at)}`
              : fromNow(group.dueAt, at)}
          </span>
        </Heading>
        <p className="text-sm text-muted-foreground">
          {group.orders.length} order{group.orders.length === 1 ? "" : "s"}
        </p>
      </div>
      <p className="text-sm">{group.items.map((item) => `${item.qty}× ${item.name}`).join(" · ")}</p>
      <ul className={CARDS}>{group.orders.map(card)}</ul>
    </section>
  );

  return (
    <div className="space-y-4">
      <SoundPrompt />
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
          onChange={(event) => {
            const value = event.target.value.slice(0, 120);
            // A scanner gun typing into the box: look the ticket up as soon as it is all there.
            const ticket = ticketTextIn(value);
            if (!ticket) return setQuery(value);
            setQuery("");
            find(ticket);
          }}
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
      {scanning ? <QrScanner onResult={read} onClose={() => setScanning(false)} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={!digits && tab === id}
            onClick={() => {
              setTab(id);
              clearSearch();
            }}
            className={`h-9 rounded-lg px-3 text-sm font-medium capitalize ${
              !digits && tab === id ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-border"
            }`}
          >
            {id} <span className="tabular-nums opacity-80">({counts[id]})</span>
          </button>
        ))}
        {digits ? <p className="text-sm text-muted-foreground">Search results for {digits}</p> : null}
      </div>

      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center">
          <p className="font-medium">
            {digits
              ? digits.length === 4
                ? `${digits} is not in the queue. Press Find to look up today's orders.`
                : "Type all 4 digits of the token."
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
      ) : !digits && tab === "active" && now !== null ? (
        <ActiveBySlot groups={slotGroups(visible, now)} now={now} section={slotSection} />
      ) : (
        <ul className={CARDS}>{visible.map(card)}</ul>
      )}
    </div>
  );
}

// Active orders by pickup slot: what to cook now first, then pre-orders under
// "Later", each slot moving up, with a chime, when it is due to start.
function ActiveBySlot({
  groups,
  now,
  section,
}: {
  groups: SlotGroup[];
  now: number;
  section: (group: SlotGroup, at: number, heading: "h2" | "h3") => ReactNode;
}) {
  const soon = groups.filter((group) => !group.later);
  const later = groups.filter((group) => group.later);
  return (
    <div className="space-y-6">
      {soon.length ? (
        soon.map((group) => section(group, now, "h2"))
      ) : (
        <p className="rounded-xl border border-dashed bg-card p-6 text-center font-medium">No orders to cook right now.</p>
      )}
      {later.length ? (
        <section aria-labelledby="later-orders" className="space-y-4 border-t pt-4">
          <div>
            <h2 id="later-orders" className="font-semibold">
              Later
            </h2>
            <p className="text-sm text-muted-foreground">
              Pre-orders. Each slot moves up, with a chime, {START_BEFORE_PICKUP_MS / 60_000} minutes before its pickup.
            </p>
          </div>
          {later.map((group) => section(group, now, "h3"))}
        </section>
      ) : null}
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
