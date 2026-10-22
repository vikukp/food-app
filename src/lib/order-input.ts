import {
  ITEM_ID_PATTERN,
  MAX_LINES_PER_ORDER,
  MAX_QTY_PER_LINE,
  MAX_STALLS_PER_BAG,
  SLOT_PATTERN,
  STALL_ID_PATTERN,
  cleanText,
  isRecord,
  toInt,
} from "@/lib/validation";

export const PAYMENT_METHODS = ["PLUXEE", "UPI", "CARD"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const MAX_NOTE_LENGTH = 120;

// One stall's part of a checkout. It becomes one order, with its own token.
export type StallOrderInput = {
  stallId: string;
  pickupSlot: string;
  items: { menuItemId: string; qty: number }[];
  // What the bag showed for this stall; a mismatch means catalogue prices changed since the items were added.
  expectedTotalInr?: number;
  // For this stall's kitchen, e.g. "less spicy".
  note?: string;
};

// Everything in the bag, paid for in one go.
export type CheckoutInput = {
  paymentMethod: PaymentMethod;
  stalls: StallOrderInput[];
};

function parseStallOrder(raw: unknown): StallOrderInput | null {
  if (!isRecord(raw)) return null;
  const stallId = cleanText(raw.stallId, 40);
  const pickupSlot = cleanText(raw.pickupSlot, 5);
  if (!STALL_ID_PATTERN.test(stallId) || !SLOT_PATTERN.test(pickupSlot)) return null;
  if (!Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > MAX_LINES_PER_ORDER) {
    return null;
  }
  const items: StallOrderInput["items"] = [];
  for (const line of raw.items) {
    if (!isRecord(line)) return null;
    const menuItemId = cleanText(line.menuItemId, 80);
    const qty = toInt(line.qty);
    if (!ITEM_ID_PATTERN.test(menuItemId) || qty === null || qty < 1 || qty > MAX_QTY_PER_LINE) return null;
    items.push({ menuItemId, qty });
  }
  if (new Set(items.map((line) => line.menuItemId)).size !== items.length) return null;
  const expectedTotalInr = raw.expectedTotalInr === undefined ? undefined : toInt(raw.expectedTotalInr);
  if (expectedTotalInr === null) return null;
  const note = cleanText(raw.note, MAX_NOTE_LENGTH) || undefined;
  return { stallId, pickupSlot, items, expectedTotalInr, note };
}

// What the checkout sends: { paymentMethod, stalls: [{ stallId, pickupSlot, items, ... }] },
// each stall at most once. Anything else is refused whole.
export function parseCheckoutInput(raw: unknown): CheckoutInput | null {
  if (!isRecord(raw)) return null;
  const paymentMethod = cleanText(raw.paymentMethod, 10);
  if (!(PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) return null;
  if (!Array.isArray(raw.stalls) || raw.stalls.length === 0 || raw.stalls.length > MAX_STALLS_PER_BAG) return null;
  const stalls: StallOrderInput[] = [];
  for (const part of raw.stalls) {
    const parsed = parseStallOrder(part);
    if (!parsed) return null;
    stalls.push(parsed);
  }
  if (new Set(stalls.map((part) => part.stallId)).size !== stalls.length) return null;
  return { paymentMethod: paymentMethod as PaymentMethod, stalls };
}
