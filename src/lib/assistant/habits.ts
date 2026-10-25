import { campusDate, campusMinutesNow } from "@/lib/hours";

// What one person usually has, learned from their own orders (catalogue.ts
// loads them): the dishes they order most, and which of those they have
// around this time of day. The assistant suggests from it, and the chat
// offers "My usual" from it.

export type PastOrder = { createdAt: Date; items: { menuItemId: string; qty: number }[] };

export type Favorite = {
  menuItemId: string;
  // Orders with this dish, and how many of them were placed within an hour and
  // a half of this time of day, on any day.
  orders: number;
  aroundNow: number;
  // The quantity they order most often, and how long since they last had it.
  usualQty: number;
  daysAgo: number;
};

// Orders this far back count.
export const HABIT_DAYS = 60;
// Twice around the same time of day makes a habit.
export const HABIT_ORDERS = 2;
const AROUND_MINUTES = 90;
const DAY_MS = 24 * 60 * 60_000;

function mostCommon(values: number[]) {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  // Ties go to the smaller quantity.
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

// Most ordered first, orders around this time of day counting three times.
export function rankFavorites(orders: PastOrder[], now = new Date()): Favorite[] {
  const nowMinutes = campusMinutesNow(now);
  const today = Date.parse(campusDate(now));
  const dishes = new Map<string, { orders: number; aroundNow: number; qtys: number[]; last: Date }>();
  for (const order of orders) {
    const apart = Math.abs(campusMinutesNow(order.createdAt) - nowMinutes);
    const aroundNow = Math.min(apart, 24 * 60 - apart) <= AROUND_MINUTES;
    // A dish on two lines of one order is still one order of it.
    const qtyById = new Map<string, number>();
    for (const item of order.items) qtyById.set(item.menuItemId, (qtyById.get(item.menuItemId) ?? 0) + item.qty);
    for (const [menuItemId, qty] of qtyById) {
      const dish = dishes.get(menuItemId) ?? { orders: 0, aroundNow: 0, qtys: [], last: order.createdAt };
      dish.orders += 1;
      if (aroundNow) dish.aroundNow += 1;
      dish.qtys.push(qty);
      if (order.createdAt > dish.last) dish.last = order.createdAt;
      dishes.set(menuItemId, dish);
    }
  }
  return [...dishes]
    .map(([menuItemId, dish]) => ({
      menuItemId,
      orders: dish.orders,
      aroundNow: dish.aroundNow,
      usualQty: mostCommon(dish.qtys),
      daysAgo: Math.round((today - Date.parse(campusDate(dish.last))) / DAY_MS),
    }))
    .sort((a, b) => b.orders + 2 * b.aroundNow - (a.orders + 2 * a.aroundNow) || a.daysAgo - b.daysAgo);
}

// "2 Masala dosa and 1 Filter coffee": the dishes they have around this time
// of day that can be ordered now (orderable: item ID to name); null if none.
export function usualText(favorites: Favorite[], orderable: Map<string, string>) {
  const parts = favorites
    .filter((favorite) => favorite.aroundNow >= HABIT_ORDERS && orderable.has(favorite.menuItemId))
    .slice(0, 3)
    .map((favorite) => `${favorite.usualQty} ${orderable.get(favorite.menuItemId)}`);
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

export function agoText(days: number) {
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}
