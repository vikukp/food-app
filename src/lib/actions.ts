"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pickupLead, serviceDay } from "@/lib/hours";
import { activeOrderCounts } from "@/lib/stall-load";
import {
  OPEN_STATUSES,
  STALL_CANCEL_REASONS,
  isOrderStatus,
  nextStatus,
  randomToken,
  stallCanCancel,
} from "@/lib/orders";
import type { CartLine } from "@/lib/cart";
import { effectivePrice } from "@/lib/pricing";
import { verifyPin } from "@/lib/pin";
import { isValidPickupSlot } from "@/lib/pickup-slots";
import { verifyQrPayload } from "@/lib/qr";
import { prisma } from "@/lib/prisma";
import { clearBucket, clientIp, consume } from "@/lib/rate-limit";
import {
  clearVendorSession,
  getEmployeeSession,
  getVendorSession,
  setVendorSession,
} from "@/lib/session";
import {
  ITEM_ID_PATTERN,
  MAX_ITEMS_PER_ORDER,
  MAX_LINES_PER_ORDER,
  MAX_QTY_PER_LINE,
  PIN_PATTERN,
  SLOT_PATTERN,
  STALL_ID_PATTERN,
  cleanText,
  isRecord,
  toInt,
} from "@/lib/validation";
import { toVendorOrder, vendorOrderInclude, type VendorOrder } from "@/lib/vendor-orders";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MINUTE = 60_000;
const ORDER_ID_PATTERN = /^[a-z0-9]{10,40}$/i;

export async function loginVendor(formData: FormData) {
  const ip = await clientIp();
  if (!consume(`vendor-login-ip:${ip}`, 20, 15 * MINUTE).ok) {
    redirect("/vendor/login?error=rate");
  }
  const stallId = cleanText(formData.get("stallId"), 40);
  const pin = cleanText(formData.get("pin"), 8);
  if (!STALL_ID_PATTERN.test(stallId)) {
    redirect("/vendor/login?error=stall");
  }
  if (!PIN_PATTERN.test(pin)) {
    redirect("/vendor/login?error=pin");
  }
  const stall = await prisma.stall.findUnique({
    where: { id: stallId },
    select: { id: true, vendorPinHash: true, sessionVersion: true },
  });
  if (!stall) {
    redirect("/vendor/login?error=stall");
  }

  // Five wrong PINs lock the stall's login for 15 minutes, whoever is trying.
  const lockKey = `vendor-pin:${stall.id}`;
  const attempts = consume(lockKey, 5, 15 * MINUTE);
  if (!attempts.ok) {
    redirect("/vendor/login?error=locked");
  }
  if (!verifyPin(pin, stall.vendorPinHash)) {
    redirect("/vendor/login?error=pin");
  }
  clearBucket(lockKey);
  await setVendorSession({ stallId: stall.id, sessionVersion: stall.sessionVersion });
  redirect("/vendor");
}

export async function logoutVendor() {
  await clearVendorSession();
  redirect("/");
}

export type PlaceOrderInput = {
  stallId: string;
  pickupSlot: string;
  paymentMethod: "PLUXEE" | "UPI" | "CARD";
  items: { menuItemId: string; qty: number }[];
  // What the bag showed; a mismatch means catalogue prices changed since the items were added.
  expectedTotalInr?: number;
};

type PlaceOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string; prices?: Record<string, number> };

function parseOrderInput(raw: unknown): PlaceOrderInput | null {
  if (!isRecord(raw)) return null;
  const stallId = cleanText(raw.stallId, 40);
  const pickupSlot = cleanText(raw.pickupSlot, 5);
  const paymentMethod = cleanText(raw.paymentMethod, 10);
  if (!STALL_ID_PATTERN.test(stallId) || !SLOT_PATTERN.test(pickupSlot)) return null;
  if (!["PLUXEE", "UPI", "CARD"].includes(paymentMethod)) return null;
  if (!Array.isArray(raw.items) || raw.items.length === 0 || raw.items.length > MAX_LINES_PER_ORDER) {
    return null;
  }
  const items: PlaceOrderInput["items"] = [];
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
  return {
    stallId,
    pickupSlot,
    paymentMethod: paymentMethod as PlaceOrderInput["paymentMethod"],
    items,
    expectedTotalInr,
  };
}

export async function placeOrder(rawInput: unknown): Promise<PlaceOrderResult> {
  const employee = await getEmployeeSession();
  if (!employee) {
    return { ok: false, error: "Your sign-in has ended. Sign in again to place this order." };
  }
  const input = parseOrderInput(rawInput);
  if (!input) {
    return { ok: false, error: "That order did not look right. Update your bag and try again." };
  }
  if (!consume(`orders:${employee.employeeId}`, 10, 10 * MINUTE).ok) {
    return { ok: false, error: "You have placed a lot of orders in a short time. Try again in a few minutes." };
  }

  const stall = await prisma.stall.findUnique({
    where: { id: input.stallId },
    include: { items: { where: { archived: false } } },
  });
  if (!stall) return { ok: false, error: "That stall is not on the court today." };
  if (stall.paused) return { ok: false, error: `${stall.name} has paused new orders for a while. Try again soon.` };
  // The earliest slot follows the kitchen's current wait, as at checkout.
  const active = (await activeOrderCounts([stall.id])).get(stall.id) ?? 0;
  const lead = pickupLead(active, stall.prepMinutes);
  if (!isValidPickupSlot(input.pickupSlot, stall.openTime, stall.closeTime, new Date(), lead)) {
    return {
      ok: false,
      error: `That pickup slot is no longer available at ${stall.name}. Pick another time.`,
    };
  }

  const menuById = new Map(stall.items.map((item) => [item.id, item]));
  const lines: {
    menuItemId: string;
    name: string;
    qty: number;
    priceInr: number;
    veg: boolean;
  }[] = [];
  let totalQty = 0;

  for (const line of input.items) {
    const item = menuById.get(line.menuItemId);
    if (!item) {
      return { ok: false, error: "One item is not from this stall. Clear your bag and try again." };
    }
    if (!item.available) {
      return { ok: false, error: `${item.name} is sold out.` };
    }
    totalQty += line.qty;
    lines.push({
      menuItemId: item.id,
      name: item.name,
      qty: line.qty,
      // Price comes from the stall's catalogue, never from the client.
      priceInr: effectivePrice(item),
      veg: item.veg,
    });
  }
  if (totalQty > MAX_ITEMS_PER_ORDER) {
    return { ok: false, error: `Orders are capped at ${MAX_ITEMS_PER_ORDER} items. Split it into two orders.` };
  }

  const totalInr = lines.reduce((sum, line) => sum + line.priceInr * line.qty, 0);
  if (input.expectedTotalInr !== undefined && input.expectedTotalInr !== totalInr) {
    return {
      ok: false,
      error: `Prices at ${stall.name} changed since you added these items. Check the new total and pay again.`,
      prices: Object.fromEntries(lines.map((line) => [line.menuItemId, line.priceInr])),
    };
  }

  const tokenDay = serviceDay(stall.openTime, stall.closeTime);
  const inSlot = await prisma.order.count({
    where: { stallId: stall.id, tokenDay, pickupSlot: input.pickupSlot, status: { not: "CANCELLED" } },
  });
  if (inSlot >= stall.slotCapacity) {
    return { ok: false, error: `The ${input.pickupSlot} pickup slot at ${stall.name} just filled up. Pick another time.` };
  }
  for (let attempt = 0; ; attempt += 1) {
    const token = randomToken();
    // Never hand out a token that an order still waiting at this stall carries,
    // even one from the previous day (24-hour counters run through midnight).
    const inUse = await prisma.order.count({
      where: { stallId: stall.id, token, status: { in: [...OPEN_STATUSES] } },
    });
    if (inUse && attempt < 19) continue;
    try {
      const order = await prisma.order.create({
        data: {
          token,
          tokenDay,
          employeeId: employee.employeeId,
          employeeName: employee.name,
          stallId: stall.id,
          status: "PLACED",
          pickupSlot: input.pickupSlot,
          paymentMethod: input.paymentMethod,
          paymentRef: `${input.paymentMethod}-MOCK-${tokenDay.replaceAll("-", "")}-${token}`,
          totalInr,
          items: {
            create: lines,
          },
        },
        select: { id: true },
      });
      revalidatePath("/orders");
      revalidatePath("/vendor");
      return { ok: true, orderId: order.id };
    } catch (error) {
      // Another order at this stall took the same token today: draw again.
      const clash = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!clash || attempt >= 19) throw error;
    }
  }
}

// The counter sends the status it was showing, so a second tablet (or a stale
// screen) cannot push an order two steps, e.g. from Preparing straight to Collected.
export async function advanceVendorOrder(rawOrderId: unknown, rawFrom: unknown): Promise<ActionResult> {
  const vendor = await getVendorSession();
  if (!vendor) return { ok: false, error: "Sign in at the stall counter first." };
  const orderId = cleanText(rawOrderId, 40);
  const from = cleanText(rawFrom, 12);
  if (!ORDER_ID_PATTERN.test(orderId) || !isOrderStatus(from)) {
    return { ok: false, error: "Order not found for this stall." };
  }
  const next = nextStatus(from);
  if (!next) return { ok: false, error: "This order is already collected." };

  const moved = await prisma.order.updateMany({
    where: { id: orderId, stallId: vendor.stallId, status: from },
    data: {
      status: next,
      ...(next === "PREPARING" ? { preparingAt: new Date() } : next === "READY" ? { readyAt: new Date() } : { collectedAt: new Date() }),
    },
  });
  if (moved.count === 0) {
    const exists = await prisma.order.count({ where: { id: orderId, stallId: vendor.stallId } });
    return {
      ok: false,
      error: exists ? "This order was updated on another screen. The queue has been refreshed." : "Order not found for this stall.",
    };
  }
  revalidatePath("/vendor");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

// Employees can cancel until the kitchen starts on it; the mock payment is refunded.
export async function cancelOwnOrder(rawOrderId: unknown): Promise<ActionResult> {
  const employee = await getEmployeeSession();
  if (!employee) return { ok: false, error: "Your sign-in has ended. Sign in again." };
  const orderId = cleanText(rawOrderId, 40);
  if (!ORDER_ID_PATTERN.test(orderId)) return { ok: false, error: "Order not found." };

  const cancelled = await prisma.order.updateMany({
    where: { id: orderId, employeeId: employee.employeeId, status: "PLACED" },
    data: { status: "CANCELLED", cancelledBy: "employee", cancelReason: null, cancelledAt: new Date() },
  });
  if (cancelled.count === 0) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, employeeId: employee.employeeId },
      select: { status: true },
    });
    if (!order) return { ok: false, error: "Order not found." };
    if (order.status === "CANCELLED") return { ok: false, error: "This order was already cancelled." };
    if (order.status === "COLLECTED") return { ok: false, error: "This order was already collected." };
    return { ok: false, error: "The stall has already started on this order, so it can no longer be cancelled." };
  }
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/vendor");
  return { ok: true };
}

// The stall can turn an order down until it is ready, with one of a few stock reasons.
export async function cancelVendorOrder(
  rawOrderId: unknown,
  rawFrom: unknown,
  rawReason: unknown,
): Promise<ActionResult> {
  const vendor = await getVendorSession();
  if (!vendor) return { ok: false, error: "Sign in at the stall counter first." };
  const orderId = cleanText(rawOrderId, 40);
  const from = cleanText(rawFrom, 12);
  const reason = cleanText(rawReason, 80);
  if (!ORDER_ID_PATTERN.test(orderId) || !stallCanCancel(from)) {
    return { ok: false, error: "This order can no longer be cancelled." };
  }
  if (!(STALL_CANCEL_REASONS as readonly string[]).includes(reason)) {
    return { ok: false, error: "Pick a reason to tell the employee." };
  }

  const cancelled = await prisma.order.updateMany({
    where: { id: orderId, stallId: vendor.stallId, status: from },
    data: { status: "CANCELLED", cancelledBy: "stall", cancelReason: reason, cancelledAt: new Date() },
  });
  if (cancelled.count === 0) {
    const exists = await prisma.order.count({ where: { id: orderId, stallId: vendor.stallId } });
    return {
      ok: false,
      error: exists ? "This order was updated on another screen. The queue has been refreshed." : "Order not found for this stall.",
    };
  }
  revalidatePath("/vendor");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

type LookupResult = { ok: true; order: VendorOrder } | { ok: false; error: string };

// The counter types a token (IWF-4821 or just 4821) or scans the ticket's QR.
// A QR must carry a valid signature and belong to this stall.
export async function lookupVendorOrder(rawQuery: unknown): Promise<LookupResult> {
  const vendor = await getVendorSession();
  if (!vendor) return { ok: false, error: "Sign in at the stall counter first." };
  const query = cleanText(rawQuery, 200);

  const include = { ...vendorOrderInclude, stall: { select: { name: true } } };
  let order;
  if (query.startsWith("IWF-FOOD|")) {
    const qr = await verifyQrPayload(query);
    if (!qr) return { ok: false, error: "That QR code is not a valid food court ticket." };
    order = await prisma.order.findUnique({ where: { id: qr.orderId }, include });
  } else {
    const digits = query.replace(/^IWF-?/i, "").trim();
    if (!/^\d{4}$/.test(digits)) return { ok: false, error: "Type the 4 digits of the token, like 4821." };
    const token = `IWF-${digits}`;
    // Tokens repeat across days: prefer the order still waiting, else this shift's.
    const stall = await prisma.stall.findUnique({
      where: { id: vendor.stallId },
      select: { openTime: true, closeTime: true },
    });
    order =
      (await prisma.order.findFirst({
        where: { stallId: vendor.stallId, token, status: { in: [...OPEN_STATUSES] } },
        orderBy: { createdAt: "desc" },
        include,
      })) ??
      (stall
        ? await prisma.order.findFirst({
            where: { stallId: vendor.stallId, token, tokenDay: serviceDay(stall.openTime, stall.closeTime) },
            include,
          })
        : null);
  }

  if (!order) return { ok: false, error: "No order with that token at this stall today." };
  if (order.stallId !== vendor.stallId) {
    return { ok: false, error: `${order.token} is an order for ${order.stall.name}, not this stall.` };
  }
  return { ok: true, order: toVendorOrder(order) };
}

type ReorderResult =
  | { ok: true; stall: { id: string; name: string }; lines: CartLine[]; skipped: string[] }
  | { ok: false; error: string };

// "Order again": the same items at today's prices, leaving out anything sold
// out or taken off the menu since.
export async function reorderLines(rawOrderId: unknown): Promise<ReorderResult> {
  const employee = await getEmployeeSession();
  if (!employee) return { ok: false, error: "Your sign-in has ended. Sign in again." };
  const orderId = cleanText(rawOrderId, 40);
  if (!ORDER_ID_PATTERN.test(orderId)) return { ok: false, error: "Order not found." };
  const order = await prisma.order.findFirst({
    where: { id: orderId, employeeId: employee.employeeId },
    include: { stall: { select: { id: true, name: true } }, items: { include: { menuItem: true } } },
  });
  if (!order) return { ok: false, error: "Order not found." };

  const lines: CartLine[] = [];
  const skipped: string[] = [];
  for (const line of order.items) {
    const item = line.menuItem;
    if (item.archived || !item.available) {
      skipped.push(line.name);
      continue;
    }
    lines.push({
      menuItemId: item.id,
      name: item.name,
      priceInr: effectivePrice(item),
      veg: item.veg,
      qty: Math.min(line.qty, MAX_QTY_PER_LINE),
    });
  }
  if (!lines.length) return { ok: false, error: "None of those items are on the menu right now." };
  return { ok: true, stall: order.stall, lines, skipped };
}

// Feedback is optional and once per order, after it has been collected.
export async function rateOrder(rawOrderId: unknown, rawRating: unknown, rawComment: unknown): Promise<ActionResult> {
  const employee = await getEmployeeSession();
  if (!employee) return { ok: false, error: "Your sign-in has ended. Sign in again." };
  const orderId = cleanText(rawOrderId, 40);
  const rating = toInt(rawRating);
  const comment = cleanText(rawComment, 280) || null;
  if (!ORDER_ID_PATTERN.test(orderId) || rating === null || rating < 1 || rating > 5) {
    return { ok: false, error: "Pick 1 to 5 stars." };
  }
  const rated = await prisma.order.updateMany({
    where: { id: orderId, employeeId: employee.employeeId, status: "COLLECTED", rating: null },
    data: { rating, ratingComment: comment, ratedAt: new Date() },
  });
  if (rated.count === 0) return { ok: false, error: "This order can't be rated (already rated, or not collected yet)." };
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}
