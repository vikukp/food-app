import { pickupLead } from "@/lib/hours";
import { getPickupSlots, type PickupSlot } from "@/lib/pickup-slots";
import { prisma } from "@/lib/prisma";

type StallTimes = { id: string; openTime: string; closeTime: string; prepMinutes: number; slotCapacity: number };

// Orders older than this that were never closed out are leftovers, not queue.
export const STALE_ORDER_MS = 12 * 60 * 60_000;

// Orders each stall still has to cook (placed or preparing).
export async function activeOrderCounts(stallIds?: string[]) {
  const rows = await prisma.order.groupBy({
    by: ["stallId"],
    where: {
      status: { in: ["PLACED", "PREPARING"] },
      createdAt: { gte: new Date(Date.now() - STALE_ORDER_MS) },
      ...(stallIds ? { stallId: { in: stallIds } } : {}),
    },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.stallId, row._count._all]));
}

// Pickup slots for each stall, starting after its current wait, with how many
// places are left in each (cancelled orders free their place).
export async function slotsWithRoom(stalls: StallTimes[], date = new Date()) {
  const active = await activeOrderCounts(stalls.map((s) => s.id));
  const slotsByStall = new Map(
    stalls.map((stall) => [
      stall.id,
      getPickupSlots(stall.openTime, stall.closeTime, date, pickupLead(active.get(stall.id) ?? 0, stall.prepMinutes)),
    ]),
  );
  const instants = [...new Set([...slotsByStall.values()].flat().map((slot) => slot.at))];
  const booked = instants.length
    ? await prisma.order.groupBy({
        by: ["stallId", "pickupAt"],
        where: {
          stallId: { in: stalls.map((s) => s.id) },
          pickupAt: { in: instants.map((at) => new Date(at)) },
          status: { not: "CANCELLED" },
        },
        _count: { _all: true },
      })
    : [];
  const taken = new Map(booked.map((row) => [`${row.stallId}|${row.pickupAt?.getTime()}`, row._count._all]));

  const result = new Map<string, PickupSlot[]>();
  for (const stall of stalls) {
    const slots = (slotsByStall.get(stall.id) ?? []).map((slot) => {
      const left = Math.max(0, stall.slotCapacity - (taken.get(`${stall.id}|${slot.at}`) ?? 0));
      return { ...slot, left, full: left === 0 };
    });
    result.set(stall.id, slots);
  }
  return result;
}
