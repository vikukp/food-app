import { MAX_LINES_PER_ORDER, MAX_QTY_PER_LINE, MAX_STALLS_PER_BAG, isRecord } from "@/lib/validation";

export type CartLine = {
  menuItemId: string;
  name: string;
  priceInr: number;
  veg: boolean;
  qty: number;
};

// One stall's part of the bag. At checkout each becomes its own order, with
// its own token and pickup time, and the bag is paid for in one go.
export type CartStall = {
  id: string;
  name: string;
  items: CartLine[];
};

export type CartState = {
  stalls: CartStall[];
};

export const EMPTY_CART: CartState = { stalls: [] };

export const CART_STORAGE_KEY = "iwf-food-cart-v1";

export function cartLines(cart: CartState) {
  return cart.stalls.flatMap((stall) => stall.items);
}

export function cartCount(cart: CartState) {
  return cartLines(cart).reduce((sum, item) => sum + item.qty, 0);
}

export function stallTotal(stall: CartStall) {
  return stall.items.reduce((sum, item) => sum + item.priceInr * item.qty, 0);
}

export function cartTotal(cart: CartState) {
  return cart.stalls.reduce((sum, stall) => sum + stallTotal(stall), 0);
}

const clampQty = (qty: number) => Math.min(Math.max(1, qty), MAX_QTY_PER_LINE);

// Why one more of this item cannot go in the bag, or null if it can.
export function addBlocker(cart: CartState, stallId: string, menuItemId: string) {
  const stall = cart.stalls.find((s) => s.id === stallId);
  if (!stall) {
    return cart.stalls.length >= MAX_STALLS_PER_BAG
      ? `Your bag already has items from ${MAX_STALLS_PER_BAG} stalls, the most one checkout takes. Pay for those first, or remove a stall.`
      : null;
  }
  if (!stall.items.some((line) => line.menuItemId === menuItemId) && stall.items.length >= MAX_LINES_PER_ORDER) {
    return `One stall's order can have up to ${MAX_LINES_PER_ORDER} different dishes.`;
  }
  return null;
}

// One more of an item. A stall new to the bag goes after the others. Returns
// the bag unchanged when addBlocker says no.
export function addToCart(cart: CartState, stall: { id: string; name: string }, item: Omit<CartLine, "qty">): CartState {
  if (addBlocker(cart, stall.id, item.menuItemId)) return cart;
  if (!cart.stalls.some((s) => s.id === stall.id)) {
    return { stalls: [...cart.stalls, { id: stall.id, name: stall.name, items: [{ ...item, qty: 1 }] }] };
  }
  return {
    stalls: cart.stalls.map((s) => {
      if (s.id !== stall.id) return s;
      const existing = s.items.some((line) => line.menuItemId === item.menuItemId);
      return {
        ...s,
        items: existing
          ? s.items.map((line) => (line.menuItemId === item.menuItemId ? { ...line, qty: clampQty(line.qty + 1) } : line))
          : [...s.items, { ...item, qty: 1 }],
      };
    }),
  };
}

// 0 removes the line; a stall with nothing left leaves the bag.
export function setLineQty(cart: CartState, menuItemId: string, qty: number): CartState {
  return {
    stalls: cart.stalls
      .map((stall) => ({
        ...stall,
        items:
          qty <= 0
            ? stall.items.filter((line) => line.menuItemId !== menuItemId)
            : stall.items.map((line) => (line.menuItemId === menuItemId ? { ...line, qty: clampQty(qty) } : line)),
      }))
      .filter((stall) => stall.items.length),
  };
}

export function removeStall(cart: CartState, stallId: string): CartState {
  return { stalls: cart.stalls.filter((stall) => stall.id !== stallId) };
}

// Today's prices, by menu item id (ids are unique across stalls).
export function applyPrices(cart: CartState, prices: Record<string, number>): CartState {
  return {
    stalls: cart.stalls.map((stall) => ({
      ...stall,
      items: stall.items.map((line) =>
        prices[line.menuItemId] === undefined ? line : { ...line, priceInr: prices[line.menuItemId] },
      ),
    })),
  };
}

// "Order again": these lines at these quantities. Anything else already in
// the bag stays. Returns null when they do not fit: a new stall in a bag that
// has the most stalls, or more different dishes than one stall's order takes.
export function putStallLines(cart: CartState, stall: { id: string; name: string }, lines: CartLine[]): CartState | null {
  const current = cart.stalls.find((s) => s.id === stall.id);
  if (!current && cart.stalls.length >= MAX_STALLS_PER_BAG) return null;
  const wanted = new Map(lines.map((line) => [line.menuItemId, { ...line, qty: clampQty(line.qty) }]));
  const kept = (current?.items ?? []).filter((line) => !wanted.has(line.menuItemId));
  const items = [...kept, ...wanted.values()];
  if (items.length > MAX_LINES_PER_ORDER) return null;
  const next = { id: stall.id, name: stall.name, items };
  return current
    ? { stalls: cart.stalls.map((s) => (s.id === stall.id ? next : s)) }
    : { stalls: [...cart.stalls, next] };
}

function isCartLine(value: unknown): value is CartLine {
  if (!isRecord(value)) return false;
  return (
    typeof value.menuItemId === "string" &&
    typeof value.name === "string" &&
    Number.isInteger(value.priceInr) &&
    typeof value.veg === "boolean" &&
    Number.isInteger(value.qty) &&
    (value.qty as number) > 0
  );
}

// What localStorage held. Bags saved before they could mix stalls were
// { stallId, stallName, items }; a hand-edited or broken bag counts as empty.
export function parseStoredCart(raw: string | null): CartState {
  if (!raw) return EMPTY_CART;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_CART;
  }
  if (!isRecord(parsed)) return EMPTY_CART;
  const saved: unknown[] = Array.isArray(parsed.stalls)
    ? parsed.stalls
    : typeof parsed.stallId === "string"
      ? [{ id: parsed.stallId, name: parsed.stallName, items: parsed.items }]
      : [];
  const stalls: CartStall[] = [];
  for (const stall of saved) {
    if (stalls.length >= MAX_STALLS_PER_BAG) break;
    if (!isRecord(stall) || typeof stall.id !== "string" || typeof stall.name !== "string") continue;
    if (!Array.isArray(stall.items) || !stall.items.length || !stall.items.every(isCartLine)) continue;
    if (stalls.some((s) => s.id === stall.id)) continue;
    const items = (stall.items as CartLine[]).slice(0, MAX_LINES_PER_ORDER);
    stalls.push({ id: stall.id, name: stall.name, items: items.map((line) => ({ ...line, qty: clampQty(line.qty) })) });
  }
  return { stalls };
}
