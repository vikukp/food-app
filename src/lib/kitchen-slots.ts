import { campusMinutesNow, parseHm } from "@/lib/hours";
import type { VendorOrder } from "@/lib/vendor-orders";

// The counter's active orders by pickup slot, so the kitchen cooks each slot
// together. A slot's orders are due to start this long before pickup; until
// then they wait under "Later", and the counter is alerted when they are due.
export const START_BEFORE_PICKUP_MS = 20 * 60_000;

// Minutes past the pickup slot, in campus time (slots can wrap past midnight).
export function minutesLate(slot: string, now: number) {
  let diff = campusMinutesNow(new Date(now)) - parseHm(slot);
  if (diff < -720) diff += 1440;
  if (diff > 720) diff -= 1440;
  return diff;
}

// When the order is to be picked up (ms). Orders from before pickupAt was
// stored go by their "HH:MM" slot, the nearest one to now.
export function dueAt(order: VendorOrder, now: number) {
  if (order.pickupAt) return Date.parse(order.pickupAt);
  return Math.floor(now / 60_000) * 60_000 - minutesLate(order.pickupSlot, now) * 60_000;
}

const cooking = (order: VendorOrder) => order.status === "PLACED" || order.status === "PREPARING";

export type SlotGroup = {
  slot: string;
  dueAt: number;
  startAt: number;
  // Nothing in it has started and its start time is still to come.
  later: boolean;
  orders: VendorOrder[];
  // Every dish the slot needs, most first.
  items: { name: string; qty: number; veg: boolean }[];
};

export function slotGroups(orders: VendorOrder[], now: number): SlotGroup[] {
  const groups = new Map<number, SlotGroup>();
  for (const order of orders.filter(cooking)) {
    const due = dueAt(order, now);
    const group = groups.get(due) ?? {
      slot: order.pickupSlot,
      dueAt: due,
      startAt: due - START_BEFORE_PICKUP_MS,
      later: true,
      orders: [],
      items: [],
    };
    group.orders.push(order);
    if (order.status !== "PLACED" || group.startAt <= now) group.later = false;
    for (const item of order.items) {
      const same = group.items.find((line) => line.name === item.name && line.veg === item.veg);
      if (same) same.qty += item.qty;
      else group.items.push({ name: item.name, qty: item.qty, veg: item.veg });
    }
    groups.set(due, group);
  }
  for (const group of groups.values()) group.items.sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
  return [...groups.values()].sort((a, b) => a.dueAt - b.dueAt);
}

// Orders not started yet whose start time has come.
export function dueToStart(orders: VendorOrder[], now: number) {
  return orders.filter((order) => order.status === "PLACED" && dueAt(order, now) - START_BEFORE_PICKUP_MS <= now);
}

// "in 12 min", "in 3 h 5 min", "now", "8 min ago".
export function fromNow(at: number, now: number) {
  const minutes = Math.round((at - now) / 60_000);
  if (minutes === 0) return "now";
  const span = Math.abs(minutes);
  const text = span >= 60 ? `${Math.floor(span / 60)} h${span % 60 ? ` ${span % 60} min` : ""}` : `${span} min`;
  return minutes > 0 ? `in ${text}` : `${text} ago`;
}
