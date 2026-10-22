"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pickupLead, serviceDay } from "@/lib/hours";
import { activeOrderCounts } from "@/lib/stall-load";
import {
  OPEN_STATUSES,
  NO_SHOW_AFTER_MS,
  cancelReasonsFor,
  isOrderStatus,
  nextStatus,
  randomToken,
  stallCanCancel,
} from "@/lib/orders";
import type { CartLine } from "@/lib/cart";
import { effectivePrice } from "@/lib/pricing";
import { verifyPin } from "@/lib/pin";
import { parseCheckoutInput, type PaymentMethod, type StallOrderInput } from "@/lib/order-input";
import { checkoutOrderBy } from "@/lib/order-view";
import { findPickupSlot } from "@/lib/pickup-slots";
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
  MAX_STALLS_PER_BAG,
  PIN_PATTERN,
  STALL_ID_PATTERN,
  cleanText,
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

type PlaceOrderResult =
  | { ok: true; orderIds: string[] }
  // stallId names the stall whose part needs changing, when it is one stall's.
  | { ok: false; error: string; prices?: Record<string, number>; stallId?: string };

type Employee = { employeeId: string; name: string };

type StallRecord = Prisma.StallGetPayload<{ include: { items: true } }>;

// One stall's order, checked and priced, ready to insert.
type OrderPlan = {
  stall: StallRecord;
  pickupSlot: string;
  pickupAt: Date;
  tokenDay: string;
  note: string | null;
  lines: { menuItemId: string; name: string; qty: number; priceInr: number; veg: boolean }[];
  totalInr: number;
};

function planStallOrder(
  part: StallOrderInput,
  stall: StallRecord | undefined,
  activeOrders: number,
): { ok: true; plan: OrderPlan } | { ok: false; error: string } {
  if (!stall) return { ok: false, error: "A stall in your bag is not on the court today. Remove it and pay again." };
  if (stall.paused) return { ok: false, error: `${stall.name} has paused new orders for a while. Try again soon.` };
  // The earliest slot follows the kitchen's current wait, as at checkout.
  const lead = pickupLead(activeOrders, stall.prepMinutes);
  const slot = findPickupSlot(part.pickupSlot, stall.openTime, stall.closeTime, new Date(), lead);
  if (!slot) {
    return { ok: false, error: `That pickup slot is no longer available at ${stall.name}. Pick another time.` };
  }

  const menuById = new Map(stall.items.map((item) => [item.id, item]));
  const lines: OrderPlan["lines"] = [];
  let totalQty = 0;
  for (const line of part.items) {
    const item = menuById.get(line.menuItemId);
    if (!item) {
      return { ok: false, error: `An item in your bag is not on the ${stall.name} menu. Remove it and pay again.` };
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
    return {
      ok: false,
      error: `Each stall's order is capped at ${MAX_ITEMS_PER_ORDER} items. Take some of the ${stall.name} items out and order them separately.`,
    };
  }
  return {
    ok: true,
    plan: {
      stall,
      pickupSlot: part.pickupSlot,
      pickupAt: new Date(slot.at),
      tokenDay: serviceDay(stall.openTime, stall.closeTime),
      note: part.note ?? null,
      lines,
      totalInr: lines.reduce((sum, line) => sum + line.priceInr * line.qty, 0),
    },
  };
}

const inSlot = (plan: OrderPlan) => ({ stallId: plan.stall.id, pickupAt: plan.pickupAt, status: { not: "CANCELLED" } });

function slotFull(plan: OrderPlan) {
  return {
    ok: false as const,
    error: `The ${plan.pickupSlot} pickup slot at ${plan.stall.name} just filled up. Pick another time.`,
    stallId: plan.stall.id,
  };
}

async function insertOrder(plan: OrderPlan, checkoutId: string, paymentMethod: PaymentMethod, employee: Employee) {
  for (let attempt = 0; ; attempt += 1) {
    const token = randomToken();
    // Never hand out a token that an order still waiting at this stall carries,
    // even one from the previous day (24-hour counters run through midnight).
    const inUse = await prisma.order.count({
      where: { stallId: plan.stall.id, token, status: { in: [...OPEN_STATUSES] } },
    });
    if (inUse && attempt < 19) continue;
    try {
      const order = await prisma.order.create({
        data: {
          token,
          tokenDay: plan.tokenDay,
          pickupAt: plan.pickupAt,
          checkoutId,
          note: plan.note,
          employeeId: employee.employeeId,
          employeeName: employee.name,
          stallId: plan.stall.id,
          status: "PLACED",
          pickupSlot: plan.pickupSlot,
          paymentMethod,
          paymentRef: `${paymentMethod}-MOCK-${plan.tokenDay.replaceAll("-", "")}-${token}`,
          totalInr: plan.totalInr,
          items: { create: plan.lines },
        },
        select: { id: true },
      });
      return order.id;
    } catch (error) {
      // Another order at this stall took the same token today: draw again.
      const clash = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!clash || attempt >= 19) throw error;
    }
  }
}

// Two checkouts can both see the last place free. Whoever committed later
// gives it back, so the slot never overfills. Commit order is the SQLite
// rowid; createdAt is stamped before the insert and can disagree.
async function keepsPlace(orderId: string, plan: OrderPlan) {
  const inSlotIds = (await prisma.order.findMany({ where: inSlot(plan), select: { id: true } })).map((o) => o.id);
  const keep = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Order" WHERE id IN (${Prisma.join(inSlotIds)}) ORDER BY rowid LIMIT ${plan.stall.slotCapacity}`;
  return keep.some((kept) => kept.id === orderId);
}

// Pays for the whole bag: one order per stall, each with its own token and
// pickup slot. Either every stall's order is placed or none is.
export async function placeOrder(rawInput: unknown): Promise<PlaceOrderResult> {
  const employee = await getEmployeeSession();
  if (!employee) {
    return { ok: false, error: "Your sign-in has ended. Sign in again to place this order." };
  }
  const input = parseCheckoutInput(rawInput);
  if (!input) {
    return { ok: false, error: "That order did not look right. Update your bag and try again." };
  }
  if (!consume(`orders:${employee.employeeId}`, 10, 10 * MINUTE).ok) {
    return { ok: false, error: "You have placed a lot of orders in a short time. Try again in a few minutes." };
  }

  const stallIds = input.stalls.map((part) => part.stallId);
  const [stalls, active] = await Promise.all([
    prisma.stall.findMany({ where: { id: { in: stallIds } }, include: { items: { where: { archived: false } } } }),
    activeOrderCounts(stallIds),
  ]);
  const plans: OrderPlan[] = [];
  const repriced: OrderPlan[] = [];
  for (const part of input.stalls) {
    const planned = planStallOrder(part, stalls.find((stall) => stall.id === part.stallId), active.get(part.stallId) ?? 0);
    if (!planned.ok) return { ...planned, stallId: part.stallId };
    if (part.expectedTotalInr !== undefined && part.expectedTotalInr !== planned.plan.totalInr) repriced.push(planned.plan);
    plans.push(planned.plan);
  }
  if (repriced.length) {
    return {
      ok: false,
      error: `Prices at ${repriced.map((plan) => plan.stall.name).join(" and ")} changed since you added these items. Check the new total and pay again.`,
      prices: Object.fromEntries(repriced.flatMap((plan) => plan.lines.map((line) => [line.menuItemId, line.priceInr]))),
    };
  }
  for (const plan of plans) {
    if ((await prisma.order.count({ where: inSlot(plan) })) >= plan.stall.slotCapacity) return slotFull(plan);
  }

  const checkoutId = randomUUID().replaceAll("-", "");
  const placed: string[] = [];
  try {
    for (const plan of plans) placed.push(await insertOrder(plan, checkoutId, input.paymentMethod, employee));
    for (const [i, plan] of plans.entries()) {
      if (!(await keepsPlace(placed[i], plan))) {
        // The bag is paid for in one go, so one full slot gives every stall's order back.
        await prisma.order.deleteMany({ where: { id: { in: placed } } });
        return slotFull(plan);
      }
    }
  } catch (error) {
    await prisma.order.deleteMany({ where: { id: { in: placed } } }).catch(() => {});
    throw error;
  }
  revalidatePath("/orders");
  revalidatePath("/vendor");
  return { ok: true, orderIds: placed };
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
  if (!cancelReasonsFor(from).includes(reason)) {
    return { ok: false, error: "Pick a reason to tell the employee." };
  }

  const cancelled = await prisma.order.updateMany({
    where: {
      id: orderId,
      stallId: vendor.stallId,
      status: from,
      ...(from === "READY" ? { readyAt: { lte: new Date(Date.now() - NO_SHOW_AFTER_MS) } } : {}),
    },
    data: { status: "CANCELLED", cancelledBy: "stall", cancelReason: reason, cancelledAt: new Date() },
  });
  if (cancelled.count === 0 && from === "READY") {
    const order = await prisma.order.findFirst({ where: { id: orderId, stallId: vendor.stallId }, select: { status: true } });
    if (order?.status === "READY") {
      return { ok: false, error: `Give them ${NO_SHOW_AFTER_MS / 60_000} minutes after it is ready before closing it as not collected.` };
    }
  }
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
  | { ok: true; stalls: { stall: { id: string; name: string }; lines: CartLine[] }[]; skipped: string[] }
  | { ok: false; error: string };

// "Order again": the same items at today's prices, leaving out anything sold
// out or taken off the menu since. Orders paid for together come back together.
export async function reorderLines(rawOrderId: unknown): Promise<ReorderResult> {
  const employee = await getEmployeeSession();
  if (!employee) return { ok: false, error: "Your sign-in has ended. Sign in again." };
  const orderId = cleanText(rawOrderId, 40);
  if (!ORDER_ID_PATTERN.test(orderId)) return { ok: false, error: "Order not found." };
  const order = await prisma.order.findFirst({
    where: { id: orderId, employeeId: employee.employeeId },
    select: { id: true, checkoutId: true },
  });
  if (!order) return { ok: false, error: "Order not found." };
  const orders = await prisma.order.findMany({
    where: {
      employeeId: employee.employeeId,
      ...(order.checkoutId ? { checkoutId: order.checkoutId } : { id: order.id }),
    },
    orderBy: checkoutOrderBy,
    include: { stall: { select: { id: true, name: true } }, items: { include: { menuItem: true } } },
  });

  const stalls: { stall: { id: string; name: string }; lines: CartLine[] }[] = [];
  const skipped: string[] = [];
  for (const past of orders) {
    const lines: CartLine[] = [];
    for (const line of past.items) {
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
    if (lines.length) stalls.push({ stall: past.stall, lines });
  }
  if (!stalls.length) return { ok: false, error: "None of those items are on the menu right now." };
  return { ok: true, stalls, skipped };
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

export type BagCheck = Record<string, { state: "ok" | "soldout" | "gone"; priceInr?: number }>;

// Checkout looks the bag up again: items can sell out, be hidden or change
// price after they were added (the bag lives in the browser). By menu item id;
// ids are unique across stalls.
export async function checkBag(rawIds: unknown): Promise<BagCheck> {
  // Menus are behind sign-in like the pages that show them.
  if (!(await getEmployeeSession())) return {};
  const ids = Array.isArray(rawIds)
    ? rawIds.slice(0, MAX_STALLS_PER_BAG * MAX_LINES_PER_ORDER).map((id) => cleanText(id, 80))
    : [];
  if (!ids.every((id) => ITEM_ID_PATTERN.test(id))) return {};
  const items = await prisma.menuItem.findMany({ where: { id: { in: ids } } });
  const byId = new Map(items.map((item) => [item.id, item]));
  return Object.fromEntries(
    ids.map((id) => {
      const item = byId.get(id);
      if (!item || item.archived) return [id, { state: "gone" as const }];
      if (!item.available) return [id, { state: "soldout" as const }];
      return [id, { state: "ok" as const, priceInr: effectivePrice(item) }];
    }),
  );
}
