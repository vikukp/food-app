import { pickupLead, serviceDay } from "@/lib/hours";
import { getPickupSlots, type PickupSlot } from "@/lib/pickup-slots";
import { prisma } from "@/lib/prisma";

type StallTimes = { id: string; openTime: string; closeTime: string; prepMinutes: number; slotCapacity: number };

// Orders each stall still has to cook (placed or preparing).
export async function activeOrderCounts(stallIds?: string[]) {
  const rows = await prisma.order.groupBy({
    by: ["stallId"],
    where: { status: { in: ["PLACED", "PREPARING"] }, ...(stallIds ? { stallId: { in: stallIds } } : {}) },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.stallId, row._count._all]));
}

// Pickup slots for each stall, starting after its current wait, with how many
// places are left in each (cancelled orders free their place).
export async function slotsWithRoom(stalls: StallTimes[], date = new Date()) {
  const active = await activeOrderCounts(stalls.map((s) => s.id));
  const days = [...new Set(stalls.map((s) => serviceDay(s.openTime, s.closeTime, date)))];
  const booked = await prisma.order.groupBy({
    by: ["stallId", "pickupSlot"],
    where: { stallId: { in: stalls.map((s) => s.id) }, tokenDay: { in: days }, status: { not: "CANCELLED" } },
    _count: { _all: true },
  });
  const taken = new Map(booked.map((row) => [`${row.stallId}|${row.pickupSlot}`, row._count._all]));

  const result = new Map<string, PickupSlot[]>();
  for (const stall of stalls) {
    const lead = pickupLead(active.get(stall.id) ?? 0, stall.prepMinutes);
    const slots = getPickupSlots(stall.openTime, stall.closeTime, date, lead).map((slot) => {
      const left = Math.max(0, stall.slotCapacity - (taken.get(`${stall.id}|${slot.value}`) ?? 0));
      return { ...slot, left, full: left === 0 };
    });
    result.set(stall.id, slots);
  }
  return result;
}
