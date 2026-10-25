import { HABIT_DAYS, HABIT_ORDERS, rankFavorites, usualText, type Favorite } from "@/lib/assistant/habits";
import { allergenLabels, hasEgg } from "@/lib/dietary";
import { hoursLabel, isStallOpen, opensLaterToday, waitCopy, waitMinutes } from "@/lib/hours";
import { effectivePrice } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { activeOrderCounts } from "@/lib/stall-load";

// What the assistant may tell people and put in their bag: the same dishes,
// prices and stall status the menu pages show, read fresh for each message.

export type Dish = {
  id: string;
  stallId: string;
  name: string;
  description: string;
  category: string;
  // What the bag charges: the offer price while there is one.
  price: number;
  veg: boolean;
  egg: boolean;
  jain: boolean;
  allergens: string[];
  kcal: number | null;
  available: boolean;
};

export type CatalogueStall = {
  id: string;
  name: string;
  cuisine: string;
  location: string;
  vegOnly: boolean;
  open: boolean;
  paused: boolean;
  openTime: string;
  opensLaterToday: boolean;
  hours: string;
  // Orders the counter still has to cook, and about how many minutes a new
  // order waits (null while the stall is closed or paused).
  queue: number;
  waitMinutes: number | null;
  wait: string | null;
  dishes: Dish[];
};

export type Catalogue = { stalls: CatalogueStall[] };

export async function loadCatalogue(now = new Date()): Promise<Catalogue> {
  const [stalls, active] = await Promise.all([
    prisma.stall.findMany({
      include: { items: { where: { archived: false }, orderBy: [{ category: "asc" }, { name: "asc" }] } },
      orderBy: { name: "asc" },
    }),
    activeOrderCounts(),
  ]);
  return {
    stalls: stalls.map((stall) => {
      const open = !stall.paused && isStallOpen(stall.openTime, stall.closeTime, now);
      const queue = active.get(stall.id) ?? 0;
      return {
        id: stall.id,
        name: stall.name,
        cuisine: stall.cuisine,
        location: stall.location,
        vegOnly: stall.vegOnly,
        open,
        paused: stall.paused,
        openTime: stall.openTime,
        opensLaterToday: opensLaterToday(stall.openTime, now),
        hours: hoursLabel(stall.openTime, stall.closeTime),
        queue,
        waitMinutes: open ? waitMinutes(queue, stall.prepMinutes) : null,
        wait: open ? waitCopy(queue, stall.prepMinutes) : null,
        dishes: stall.items.map((item) => ({
          id: item.id,
          stallId: stall.id,
          name: item.name,
          description: item.description,
          category: item.category,
          price: effectivePrice(item),
          veg: item.veg,
          egg: hasEgg(item),
          jain: item.veg && item.jain,
          allergens: allergenLabels(item.allergens),
          kcal: item.kcal,
          available: item.available,
        })),
      };
    }),
  };
}

// What this person orders most (habits.ts), from their own orders of the last
// weeks; cancelled ones don't count.
export async function loadFavorites(employeeId: string, now = new Date()): Promise<Favorite[]> {
  const orders = await prisma.order.findMany({
    where: {
      employeeId,
      status: { not: "CANCELLED" },
      createdAt: { gte: new Date(now.getTime() - HABIT_DAYS * 24 * 60 * 60_000) },
    },
    select: { createdAt: true, items: { select: { menuItemId: true, qty: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return rankFavorites(orders, now);
}

// For the chat's first suggestions: their usual at this time of day, if they
// have one that can be ordered now, and whether they have ordered at all.
export async function usualOrder(employeeId: string, now = new Date()) {
  const favorites = await loadFavorites(employeeId, now);
  const habits = favorites.filter((favorite) => favorite.aroundNow >= HABIT_ORDERS).map((favorite) => favorite.menuItemId);
  const items = habits.length
    ? await prisma.menuItem.findMany({
        where: { id: { in: habits }, archived: false, available: true },
        select: { id: true, name: true, stall: { select: { openTime: true, closeTime: true, paused: true } } },
      })
    : [];
  const orderable = new Map(
    items
      .filter((item) => !item.stall.paused && isStallOpen(item.stall.openTime, item.stall.closeTime, now))
      .map((item) => [item.id, item.name]),
  );
  return { usual: usualText(favorites, orderable), ordered: favorites.length > 0 };
}
