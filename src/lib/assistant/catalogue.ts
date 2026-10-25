import { allergenLabels, hasEgg } from "@/lib/dietary";
import { hoursLabel, isStallOpen, opensLaterToday, waitCopy } from "@/lib/hours";
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
        wait: open ? waitCopy(active.get(stall.id) ?? 0, stall.prepMinutes) : null,
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
