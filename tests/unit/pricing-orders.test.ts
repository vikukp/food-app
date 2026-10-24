import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cartCount, cartTotal, EMPTY_CART } from "@/lib/cart";
import { formatInr } from "@/lib/money";
import { EMPLOYEE_CANCEL_MS, employeeCanCancel, isOrderStatus, nextStatus, randomToken, statusLabel } from "@/lib/orders";
import { effectivePrice, hasOffer, offerPercent } from "@/lib/pricing";

describe("pricing", () => {
  it("charges the offer price only when it is a real discount", () => {
    assert.equal(effectivePrice({ priceInr: 120, offerPriceInr: 99 }), 99);
    assert.equal(effectivePrice({ priceInr: 120, offerPriceInr: 120 }), 120);
    assert.equal(effectivePrice({ priceInr: 120, offerPriceInr: 150 }), 120);
    assert.equal(effectivePrice({ priceInr: 120, offerPriceInr: 0 }), 120);
    assert.equal(effectivePrice({ priceInr: 120, offerPriceInr: null }), 120);
    assert.equal(hasOffer({ priceInr: 120 }), false);
    assert.equal(offerPercent({ priceInr: 120, offerPriceInr: 99 }), 18);
  });

  it("formats rupees without paise", () => {
    assert.equal(formatInr(1250), "₹1,250");
  });

  it("totals the bag across stalls", () => {
    const cart = {
      stalls: [
        {
          id: "momos",
          name: "Momos",
          items: [
            { menuItemId: "a", name: "A", priceInr: 80, veg: true, qty: 2 },
            { menuItemId: "b", name: "B", priceInr: 45, veg: false, qty: 1 },
          ],
        },
        { id: "juice", name: "Juice", items: [{ menuItemId: "c", name: "C", priceInr: 60, veg: true, qty: 1 }] },
      ],
    };
    assert.equal(cartCount(cart), 4);
    assert.equal(cartTotal(cart), 265);
    assert.equal(cartTotal(EMPTY_CART), 0);
  });
});

describe("order status", () => {
  it("moves one step at a time and stops at collected", () => {
    assert.equal(nextStatus("PLACED"), "PREPARING");
    assert.equal(nextStatus("PREPARING"), "READY");
    assert.equal(nextStatus("READY"), "COLLECTED");
    assert.equal(nextStatus("COLLECTED"), null);
    assert.equal(isOrderStatus("READY"), true);
    assert.equal(isOrderStatus("ready"), false);
    assert.equal(statusLabel("READY"), "Ready for pickup");
  });

  it("draws tokens in T-1000..T-9999", () => {
    for (let i = 0; i < 500; i += 1) assert.match(randomToken(), /^T-[1-9]\d{3}$/);
  });

  it("lets the employee cancel only in the first 30 seconds, before the kitchen starts", () => {
    const placedAt = new Date("2026-10-24T12:00:00Z");
    const at = (ms: number) => placedAt.getTime() + ms;
    assert.equal(EMPLOYEE_CANCEL_MS, 30_000);
    assert.equal(employeeCanCancel({ status: "PLACED", createdAt: placedAt }, at(0)), true);
    assert.equal(employeeCanCancel({ status: "PLACED", createdAt: placedAt.toISOString() }, at(29_999)), true);
    assert.equal(employeeCanCancel({ status: "PLACED", createdAt: placedAt }, at(30_000)), false);
    assert.equal(employeeCanCancel({ status: "PREPARING", createdAt: placedAt }, at(5_000)), false);
    assert.equal(employeeCanCancel({ status: "CANCELLED", createdAt: placedAt }, at(5_000)), false);
  });
});
