import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ticketCheck } from "@/lib/handover";
import type { VendorOrder } from "@/lib/vendor-orders";

const at = (time: string) => new Date(`${time}+05:30`).toISOString();
const now = Date.parse(at("2026-10-26T13:00"));

function order(status: string, extra: Partial<VendorOrder> = {}): VendorOrder {
  return {
    id: "o1",
    token: "T-4821",
    status,
    pickupSlot: "12:45",
    pickupAt: at("2026-10-26T12:45"),
    paymentLabel: "UPI",
    totalInr: 80,
    employeeName: "Priya Nair",
    cancelReason: null,
    createdAt: at("2026-10-26T12:20"),
    readyAt: null,
    collectedAt: null,
    cancelledAt: null,
    note: null,
    items: [],
    ...extra,
  };
}

describe("a ticket at the counter", () => {
  it("is refused once collected, however it is shown, saying when", () => {
    const used = order("COLLECTED", { collectedAt: at("2026-10-26T12:41") });
    for (const by of ["scan", "typed"] as const) {
      assert.deepEqual(ticketCheck(used, by, now), {
        level: "stop",
        text: "Already collected at 12:41. This ticket has been used: don't hand anything over.",
      });
    }
  });

  it("names the day when it was collected on another one", () => {
    const old = order("COLLECTED", { collectedAt: at("2026-10-24T12:41") });
    assert.match(ticketCheck(old, "scan", now)!.text, /^Already collected on 24 Oct at 12:41\./);
  });

  it("is refused when the order was cancelled", () => {
    const cancelled = order("CANCELLED", { cancelledAt: at("2026-10-26T12:05") });
    assert.deepEqual(ticketCheck(cancelled, "scan", now), {
      level: "stop",
      text: "Cancelled at 12:05 and refunded. Don't hand anything over.",
    });
  });

  it("asks for the name when the token was typed in, as tokens are on the public board", () => {
    assert.deepEqual(ticketCheck(order("READY"), "typed", now), {
      level: "check",
      text: "Token typed in, not scanned. Ask their name before handing over: Priya Nair.",
    });
  });

  it("needs nothing more when a ready ticket is scanned, or the order is still being made", () => {
    assert.equal(ticketCheck(order("READY"), "scan", now), null);
    assert.equal(ticketCheck(order("PREPARING"), "typed", now), null);
    assert.equal(ticketCheck(order("PLACED"), "scan", now), null);
  });
});
