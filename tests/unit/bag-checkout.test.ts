import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_CART,
  addBlocker,
  addToCart,
  applyPrices,
  parseStoredCart,
  putStallLines,
  setLineQty,
  type CartState,
} from "@/lib/cart";
import { parseCheckoutInput } from "@/lib/order-input";
import { MAX_LINES_PER_ORDER, MAX_QTY_PER_LINE, MAX_STALLS_PER_BAG } from "@/lib/validation";

const dish = (id: string, priceInr = 50) => ({ menuItemId: id, name: id.toUpperCase(), priceInr, veg: true });
const momos = { id: "momos", name: "Momos" };
const juice = { id: "juice", name: "Juice" };

function bagOf(...stallIds: string[]): CartState {
  return stallIds.reduce<CartState>((cart, id) => addToCart(cart, { id, name: id }, dish(`${id}-1`)), EMPTY_CART);
}

describe("the bag", () => {
  it("keeps the first stall's items when a second stall is added", () => {
    let cart = addToCart(EMPTY_CART, momos, dish("m1"));
    cart = addToCart(cart, juice, dish("j1"));
    assert.deepEqual(
      cart.stalls.map((stall) => [stall.id, stall.items.map((line) => line.menuItemId)]),
      [
        ["momos", ["m1"]],
        ["juice", ["j1"]],
      ],
    );
  });

  it("counts the same dish up, to the per-line cap", () => {
    let cart = EMPTY_CART;
    for (let i = 0; i < MAX_QTY_PER_LINE + 3; i += 1) cart = addToCart(cart, momos, dish("m1"));
    assert.equal(cart.stalls[0].items[0].qty, MAX_QTY_PER_LINE);
  });

  it(`refuses a stall beyond ${MAX_STALLS_PER_BAG}, but not more of one already in the bag`, () => {
    const full = bagOf("a1", "b1", "c1", "d1");
    assert.equal(full.stalls.length, MAX_STALLS_PER_BAG);
    assert.match(addBlocker(full, "e1", "e1-1") ?? "", /4 stalls/);
    assert.equal(addToCart(full, { id: "e1", name: "E" }, dish("e1-1")), full);
    assert.equal(addBlocker(full, "a1", "a1-2"), null);
    assert.equal(addToCart(full, { id: "a1", name: "a1" }, dish("a1-2")).stalls[0].items.length, 2);
  });

  it(`refuses a ${MAX_LINES_PER_ORDER + 1}th different dish from one stall`, () => {
    let cart = EMPTY_CART;
    for (let i = 0; i < MAX_LINES_PER_ORDER; i += 1) cart = addToCart(cart, momos, dish(`m${i}`));
    assert.match(addBlocker(cart, "momos", "m-new") ?? "", /15 different dishes/);
    assert.equal(addBlocker(cart, "momos", "m0"), null);
    assert.equal(addBlocker(cart, "juice", "j1"), null);
  });

  it("drops a line at 0 and a stall with nothing left", () => {
    let cart = addToCart(addToCart(EMPTY_CART, momos, dish("m1")), juice, dish("j1"));
    cart = setLineQty(cart, "m1", 3);
    assert.equal(cart.stalls[0].items[0].qty, 3);
    cart = setLineQty(cart, "m1", 0);
    assert.deepEqual(
      cart.stalls.map((stall) => stall.id),
      ["juice"],
    );
  });

  it("applies today's prices in every stall", () => {
    const cart = applyPrices(addToCart(addToCart(EMPTY_CART, momos, dish("m1", 80)), juice, dish("j1", 40)), {
      m1: 90,
      j1: 35,
      other: 1,
    });
    assert.deepEqual(
      cart.stalls.map((stall) => stall.items[0].priceInr),
      [90, 35],
    );
  });

  it("order again sets the past quantities and keeps the rest of the bag", () => {
    let cart = addToCart(addToCart(EMPTY_CART, momos, dish("m1")), momos, dish("m2"));
    cart = addToCart(cart, juice, dish("j1"));
    const again = putStallLines(cart, momos, [{ ...dish("m2"), qty: 4 }, { ...dish("m3"), qty: 1 }]);
    assert.ok(again);
    assert.deepEqual(
      again.stalls.map((stall) => [stall.id, stall.items.map((line) => `${line.menuItemId}x${line.qty}`)]),
      [
        ["momos", ["m1x1", "m2x4", "m3x1"]],
        ["juice", ["j1x1"]],
      ],
    );
    assert.equal(putStallLines(bagOf("a1", "b1", "c1", "d1"), momos, [{ ...dish("m1"), qty: 1 }]), null);
  });

  it("reads bags saved before stalls could mix, and drops broken ones", () => {
    const old = JSON.stringify({ stallId: "momos", stallName: "Momos", items: [{ ...dish("m1"), qty: 50 }] });
    assert.deepEqual(parseStoredCart(old), {
      stalls: [{ id: "momos", name: "Momos", items: [{ ...dish("m1"), qty: MAX_QTY_PER_LINE }] }],
    });
    const saved = JSON.stringify({
      stalls: [
        { id: "momos", name: "Momos", items: [{ ...dish("m1"), qty: 1 }] },
        { id: "juice", name: "Juice", items: [{ ...dish("j1"), qty: "2" }] },
        { id: "momos", name: "Again", items: [{ ...dish("m2"), qty: 1 }] },
        { id: "tea", name: "Tea", items: [] },
      ],
    });
    assert.deepEqual(
      parseStoredCart(saved).stalls.map((stall) => stall.name),
      ["Momos"],
    );
    for (const junk of [null, "", "{", "[]", "42", JSON.stringify({ stalls: "x" })]) {
      assert.deepEqual(parseStoredCart(junk), EMPTY_CART, String(junk));
    }
  });
});

describe("checkout input", () => {
  const part = (stallId: string, extra: Record<string, unknown> = {}) => ({
    stallId,
    pickupSlot: "12:30",
    items: [{ menuItemId: `${stallId}-1`, qty: 2 }],
    ...extra,
  });

  it("takes one part per stall and one payment method", () => {
    const parsed = parseCheckoutInput({
      paymentMethod: "UPI",
      stalls: [part("momos", { expectedTotalInr: 160, note: "  less spicy\u0007 " }), part("juice")],
    });
    assert.deepEqual(parsed, {
      paymentMethod: "UPI",
      stalls: [
        { stallId: "momos", pickupSlot: "12:30", items: [{ menuItemId: "momos-1", qty: 2 }], expectedTotalInr: 160, note: "less spicy" },
        { stallId: "juice", pickupSlot: "12:30", items: [{ menuItemId: "juice-1", qty: 2 }], expectedTotalInr: undefined, note: undefined },
      ],
    });
  });

  it("refuses anything that does not look like a bag", () => {
    const bad: unknown[] = [
      null,
      { paymentMethod: "CASH", stalls: [part("momos")] },
      { paymentMethod: "UPI", stalls: [] },
      { paymentMethod: "UPI", stalls: ["momos", "juice", "tea", "dosa", "chaat"].map((id) => part(id)) },
      { paymentMethod: "UPI", stalls: [part("momos"), part("momos")] },
      { paymentMethod: "UPI", stalls: [part("momos", { pickupSlot: "24:00" })] },
      { paymentMethod: "UPI", stalls: [part("momos", { items: [] })] },
      { paymentMethod: "UPI", stalls: [part("momos", { items: [{ menuItemId: "m1", qty: 0 }] })] },
      { paymentMethod: "UPI", stalls: [part("momos", { items: [{ menuItemId: "m1", qty: MAX_QTY_PER_LINE + 1 }] })] },
      { paymentMethod: "UPI", stalls: [part("momos", { items: [{ menuItemId: "m1", qty: 1 }, { menuItemId: "m1", qty: 1 }] })] },
      { paymentMethod: "UPI", stalls: [part("momos", { expectedTotalInr: 9.5 })] },
      // One stall's fields at the top level, as single-stall checkouts sent them.
      { paymentMethod: "UPI", ...part("momos") },
    ];
    for (const input of bad) assert.equal(parseCheckoutInput(input), null, JSON.stringify(input));
  });
});
