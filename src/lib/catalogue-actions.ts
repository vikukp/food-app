"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashPin, verifyPin } from "@/lib/pin";
import { prisma } from "@/lib/prisma";
import { consume } from "@/lib/rate-limit";
import { getVendorSession, setVendorSession } from "@/lib/session";
import { ITEM_ID_PATTERN, PIN_PATTERN, cleanText, toInt } from "@/lib/validation";

const MENU_PATH = "/vendor/menu";
const MAX_PRICE_INR = 5000;
const MAX_ITEMS_PER_STALL = 80;

function done(code: string): never {
  revalidatePath(MENU_PATH);
  redirect(`${MENU_PATH}?ok=${code}`);
}

function fail(code: string): never {
  redirect(`${MENU_PATH}?error=${code}`);
}

async function requireVendor() {
  const vendor = await getVendorSession();
  if (!vendor) redirect("/vendor/login");
  if (!consume(`catalogue:${vendor.stallId}`, 120, 10 * 60_000).ok) fail("rate");
  return vendor;
}

async function ownedItem(stallId: string, rawId: unknown) {
  const id = cleanText(rawId, 80);
  if (!ITEM_ID_PATTERN.test(id)) fail("notfound");
  const item = await prisma.menuItem.findUnique({ where: { id } });
  if (!item || item.stallId !== stallId) fail("notfound");
  return item;
}

type ItemFields = {
  name: string;
  description: string;
  category: string;
  priceInr: number;
  veg: boolean;
  offerPriceInr: number | null;
  offerLabel: string | null;
};

function readItemFields(formData: FormData): ItemFields {
  const name = cleanText(formData.get("name"), 60);
  const description = cleanText(formData.get("description"), 160);
  const category = cleanText(formData.get("category"), 30);
  const priceInr = toInt(formData.get("priceInr"));
  const veg = formData.get("veg") === "on";
  const offerRaw = cleanText(formData.get("offerPriceInr"), 6);
  const offerLabel = cleanText(formData.get("offerLabel"), 40) || null;

  if (name.length < 2 || category.length < 2) fail("invalid");
  if (priceInr === null || priceInr < 1 || priceInr > MAX_PRICE_INR) fail("price");

  let offerPriceInr: number | null = null;
  if (offerRaw) {
    const offer = toInt(offerRaw);
    if (offer === null || offer < 1 || offer >= priceInr) fail("offer");
    offerPriceInr = offer;
  }
  return {
    name,
    description,
    category,
    priceInr,
    veg,
    offerPriceInr,
    offerLabel: offerPriceInr ? offerLabel : null,
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

export async function createMenuItem(formData: FormData) {
  const vendor = await requireVendor();
  const fields = readItemFields(formData);
  // Hidden items do not count, so hiding a few frees room as the "full" message says.
  const count = await prisma.menuItem.count({ where: { stallId: vendor.stallId, archived: false } });
  if (count >= MAX_ITEMS_PER_STALL) fail("full");

  const id = `${vendor.stallId}-${slugify(fields.name) || "item"}-${randomBytes(2).toString("hex")}`;
  await prisma.menuItem.create({
    data: { id, stallId: vendor.stallId, available: true, ...fields },
  });
  done("added");
}

export async function updateMenuItem(formData: FormData) {
  const vendor = await requireVendor();
  const item = await ownedItem(vendor.stallId, formData.get("itemId"));
  const fields = readItemFields(formData);
  await prisma.menuItem.update({ where: { id: item.id }, data: fields });
  done("saved");
}

export async function setItemAvailability(formData: FormData) {
  const vendor = await requireVendor();
  const item = await ownedItem(vendor.stallId, formData.get("itemId"));
  const available = formData.get("available") === "1";
  await prisma.menuItem.update({ where: { id: item.id }, data: { available } });
  done(available ? "available" : "soldout");
}

export async function setItemArchived(formData: FormData) {
  const vendor = await requireVendor();
  const item = await ownedItem(vendor.stallId, formData.get("itemId"));
  const archived = formData.get("archived") === "1";
  if (!archived && item.archived) {
    const count = await prisma.menuItem.count({ where: { stallId: vendor.stallId, archived: false } });
    if (count >= MAX_ITEMS_PER_STALL) fail("full");
  }
  await prisma.menuItem.update({ where: { id: item.id }, data: { archived } });
  done(archived ? "hidden" : "restored");
}

export async function changeVendorPin(formData: FormData) {
  const vendor = await requireVendor();
  const current = cleanText(formData.get("currentPin"), 8);
  const next = cleanText(formData.get("newPin"), 8);
  const confirm = cleanText(formData.get("confirmPin"), 8);
  if (!PIN_PATTERN.test(next)) fail("pinformat");
  if (next !== confirm) fail("pinmatch");
  const stall = await prisma.stall.findUnique({
    where: { id: vendor.stallId },
    select: { vendorPinHash: true },
  });
  if (!stall || !verifyPin(current, stall.vendorPinHash)) fail("pin");
  // A new session version signs out every other counter tablet; this one stays signed in.
  const updated = await prisma.stall.update({
    where: { id: vendor.stallId },
    data: { vendorPinHash: hashPin(next), sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  await setVendorSession({ stallId: vendor.stallId, sessionVersion: updated.sessionVersion });
  done("pin");
}
