import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { START_BEFORE_PICKUP_MS, dueAt, dueToStart, fromNow, minutesLate, slotGroups } from "@/lib/kitchen-slots";
import type { VendorOrder } from "@/lib/vendor-orders";

const at = (time: string) => Date.parse(`${time}+05:30`);
const momos = { id: "i1", name: "Veg steamed momos (8)", qty: 1, veg: true };
const maggi = { id: "i2", name: "Cheese maggi", qty: 1, veg: true };

function order(token: string, slot: string, pickupAt: string | null, extra: Partial<VendorOrder> = {}): VendorOrder {
  return {
    id: token,
    token,
    status: "PLACED",
    pickupSlot: slot,
    pickupAt: pickupAt ? new Date(at(pickupAt)).toISOString() : null,
    paymentLabel: "UPI",
    totalInr: 80,
    employeeName: "Priya Nair",
    cancelReason: null,
    createdAt: new Date(at("2026-10-25T20:00")).toISOString(),
    readyAt: null,
    note: null,
    items: [momos],
    ...extra,
  };
}

describe("counter slots", () => {
  const now = at("2026-10-25T20:40");
  const orders = [
    order("T-1001", "20:45", "2026-10-25T20:45", { items: [{ ...momos, qty: 2 }, maggi] }),
    order("T-1002", "00:30", "2026-10-26T00:30"),
    order("T-1003", "20:45", "2026-10-25T20:45", { status: "PREPARING" }),
    order("T-1004", "21:00", "2026-10-25T21:00"),
    order("T-1005", "20:30", "2026-10-25T20:30", { status: "READY" }),
  ];

  it("group what is still to cook by pickup slot, earliest first, with every dish the slot needs", () => {
    const groups = slotGroups(orders, now);
    assert.deepEqual(
      groups.map((g) => [g.slot, g.later, g.orders.map((o) => o.token)]),
      [
        ["20:45", false, ["T-1001", "T-1003"]],
        // 20 minutes before 21:00 is 20:40: due to start now.
        ["21:00", false, ["T-1004"]],
        ["00:30", true, ["T-1002"]],
      ],
    );
    assert.deepEqual(groups[0].items.map((i) => `${i.qty}× ${i.name}`), ["3× Veg steamed momos (8)", "1× Cheese maggi"]);
    assert.equal(groups[2].startAt, at("2026-10-26T00:10"));
  });

  it("call the orders whose start time has come, and nothing already started", () => {
    assert.equal(START_BEFORE_PICKUP_MS, 20 * 60_000);
    assert.deepEqual(dueToStart(orders, now).map((o) => o.token), ["T-1001", "T-1004"]);
    assert.deepEqual(dueToStart(orders, at("2026-10-26T00:10")).map((o) => o.token), ["T-1001", "T-1002", "T-1004"]);
  });

  it("move a pre-order up once the counter has started it early", () => {
    const early = order("T-1006", "00:30", "2026-10-26T00:30", { status: "PREPARING" });
    assert.equal(slotGroups([early], now)[0].later, false);
  });

  it("place orders from before pickup times were stored by their slot, across midnight", () => {
    assert.equal(dueAt(order("T-1", "20:45", null), now), at("2026-10-25T20:45"));
    assert.equal(dueAt(order("T-2", "00:30", null), at("2026-10-25T23:50")), at("2026-10-26T00:30"));
    assert.equal(minutesLate("23:55", at("2026-10-26T00:05")), 10);
  });

  it("say when, in words", () => {
    assert.equal(fromNow(now + 12 * 60_000, now), "in 12 min");
    assert.equal(fromNow(now + 185 * 60_000, now), "in 3 h 5 min");
    assert.equal(fromNow(now + 120 * 60_000, now), "in 2 h");
    assert.equal(fromNow(now + 20_000, now), "now");
    assert.equal(fromNow(now - 8 * 60_000, now), "8 min ago");
  });
});
