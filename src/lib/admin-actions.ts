"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/admin";
import { hashPin } from "@/lib/pin";
import { prisma } from "@/lib/prisma";
import { canChangePin } from "@/lib/session";
import { STALL_ID_PATTERN, cleanText } from "@/lib/validation";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function stallFor(rawStallId: unknown) {
  const stallId = cleanText(rawStallId, 40);
  if (!STALL_ID_PATTERN.test(stallId)) return null;
  return prisma.stall.findUnique({ where: { id: stallId }, select: { id: true, name: true } });
}

export async function adminSetPaused(rawStallId: unknown, paused: boolean): Promise<Result> {
  const admin = await getAdminSession();
  if (!admin) return { ok: false, error: "Only food court admins can do that." };
  const stall = await stallFor(rawStallId);
  if (!stall) return { ok: false, error: "Stall not found." };
  await prisma.stall.update({ where: { id: stall.id }, data: { paused: paused === true } });
  console.info(`[admin] ${admin.employeeId} ${paused ? "paused" : "resumed"} ${stall.id}`);
  revalidatePath("/admin");
  revalidatePath("/stalls");
  return { ok: true };
}

// A stall that forgot its counter PIN gets a new random one, shown once to the
// admin. Every tablet signed in to the stall is signed out. Needs a code
// sign-in in the last 10 minutes, like changing your own PIN.
export async function adminResetStallPin(rawStallId: unknown): Promise<Result<{ pin: string }>> {
  const admin = await getAdminSession();
  if (!admin) return { ok: false, error: "Only food court admins can do that." };
  if (!canChangePin(admin)) {
    return { ok: false, error: "For PIN resets, sign in again with a one-time code first (it counts for 10 minutes)." };
  }
  const stall = await stallFor(rawStallId);
  if (!stall) return { ok: false, error: "Stall not found." };
  const pin = String(randomInt(100000, 1000000));
  await prisma.stall.update({
    where: { id: stall.id },
    data: { vendorPinHash: hashPin(pin), sessionVersion: { increment: 1 } },
  });
  console.info(`[admin] ${admin.employeeId} reset the counter PIN of ${stall.id}`);
  return { ok: true, pin };
}
