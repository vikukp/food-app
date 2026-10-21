"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateToken, nextStatus, type OrderStatus } from "@/lib/orders";
import { effectivePrice } from "@/lib/pricing";
import { verifyPin } from "@/lib/pin";
import { isValidPickupSlot } from "@/lib/pickup-slots";
import { prisma } from "@/lib/prisma";
import { clearBucket, clientIp, consume } from "@/lib/rate-limit";
import {
  clearEmployeeSession,
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

export type ActionResult = { ok: true } | { ok: false; error: string };

const MINUTE = 60_000;

export async function logoutEmployee() {
  await clearEmployeeSession();
  redirect("/");
}

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
    select: { id: true, vendorPinHash: true },
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
  await setVendorSession({ stallId: stall.id });
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
};

type PlaceOrderResult = { ok: true; orderId: string } | { ok: false; error: string };

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
  return {
    stallId,
    pickupSlot,
    paymentMethod: paymentMethod as PlaceOrderInput["paymentMethod"],
    items,
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
  if (!isValidPickupSlot(input.pickupSlot, stall.openTime, stall.closeTime)) {
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
  const token = await generateToken();
  const paymentRef = `${input.paymentMethod}-MOCK-${token}`;

  const order = await prisma.order.create({
    data: {
      token,
      employeeId: employee.employeeId,
      employeeName: employee.name,
      stallId: stall.id,
      status: "PLACED",
      pickupSlot: input.pickupSlot,
      paymentMethod: input.paymentMethod,
      paymentRef,
      totalInr,
      items: {
        create: lines,
      },
    },
  });

  revalidatePath("/orders");
  revalidatePath("/vendor");
  return { ok: true, orderId: order.id };
}

export async function advanceVendorOrder(rawOrderId: unknown): Promise<ActionResult> {
  const vendor = await getVendorSession();
  if (!vendor) return { ok: false, error: "Sign in at the stall counter first." };
  const orderId = cleanText(rawOrderId, 40);
  if (!/^[a-z0-9]{10,40}$/i.test(orderId)) return { ok: false, error: "Order not found for this stall." };

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.stallId !== vendor.stallId) {
    return { ok: false, error: "Order not found for this stall." };
  }
  const next = nextStatus(order.status as OrderStatus);
  if (!next) return { ok: false, error: "This order is already collected." };

  await prisma.order.update({
    where: { id: orderId },
    data: { status: next },
  });
  revalidatePath("/vendor");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}
