"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/components/cart-provider";
import { VegDot } from "@/components/veg-dot";
import { Button } from "@/components/ui/button";
import { allergenLabels, hasEgg } from "@/lib/dietary";
import { formatInr } from "@/lib/money";
import { effectivePrice, hasOffer, offerPercent } from "@/lib/pricing";

export type MenuItemData = {
  id: string;
  name: string;
  description: string;
  priceInr: number;
  offerPriceInr?: number | null;
  offerLabel?: string | null;
  veg: boolean;
  egg: boolean;
  jain: boolean;
  allergens: string;
  kcal: number | null;
  category: string;
  available: boolean;
};

// Meals first; drinks, desserts and extras at the end, as on a printed menu.
const LATER = ["side", "extra", "add-on", "addon", "drink", "beverage", "juice", "shake", "coffee", "tea", "dessert", "sweet"];
function categoryRank(category: string) {
  const name = category.toLowerCase();
  const later = LATER.findIndex((word) => name.includes(word));
  return later === -1 ? 0 : 1 + later;
}

const FILTERS = [
  { id: "all", label: "All", keep: () => true },
  { id: "veg", label: "Veg", keep: (item: MenuItemData) => item.veg },
  { id: "noegg", label: "No egg", keep: (item: MenuItemData) => !hasEgg(item) },
  { id: "jain", label: "Jain", keep: (item: MenuItemData) => item.veg && item.jain },
] as const;

export function MenuList({
  stall,
  items,
}: {
  stall: { id: string; name: string };
  items: MenuItemData[];
}) {
  const { addItem, cart } = useCart();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const keep = FILTERS.find((f) => f.id === filter)!.keep;
  const shown = items.filter(keep);
  const categories = [...new Set(shown.map((item) => item.category))].sort(
    (a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b),
  );
  // Only offer filters that would leave something on this menu.
  const filters = FILTERS.filter((f) => f.id === "all" || (items.some(f.keep) && !items.every(f.keep)));

  return (
    <div className="space-y-8 pb-24 md:pb-8">
      {filters.length > 1 ? (
        <div role="group" aria-label="Filter the menu" className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`h-8 rounded-full px-3 text-sm font-medium ${
                filter === f.id ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-border"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}
      {categories.map((category) => (
        <section key={category}>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {category}
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            {shown
              .filter((item) => item.category === category)
              .map((item) => {
                const qty =
                  cart.stallId === stall.id
                    ? cart.items.find((line) => line.menuItemId === item.id)?.qty ?? 0
                    : 0;
                return (
                  <li key={item.id} className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        <VegDot veg={item.veg} egg={item.egg} />
                        {item.name}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                      <DietaryLine item={item} />
                      {hasOffer(item) ? (
                        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-semibold">{formatInr(effectivePrice(item))}</span>
                          <span className="text-muted-foreground line-through">{formatInr(item.priceInr)}</span>
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-950">
                            {item.offerLabel ? `${item.offerLabel} · ` : ""}−{offerPercent(item)}%
                          </span>
                        </p>
                      ) : (
                        <p className="mt-2 text-sm font-semibold">{formatInr(item.priceInr)}</p>
                      )}
                    </div>
                    {item.available ? (
                      <Button
                        variant="outline"
                        className="shrink-0"
                        onClick={() => {
                          const line = {
                            menuItemId: item.id,
                            name: item.name,
                            priceInr: effectivePrice(item),
                            veg: item.veg,
                          };
                          const otherStall = cart.stallId && cart.stallId !== stall.id && cart.items.length;
                          if (otherStall) {
                            // Never empty someone's bag on one tap: ask first.
                            const n = cart.items.reduce((sum, l) => sum + l.qty, 0);
                            toast.warning(`Your bag has ${n} item${n > 1 ? "s" : ""} from ${cart.stallName}`, {
                              id: "bag-replace",
                              description: "One stall per order. Start a new bag here?",
                              duration: 8000,
                              action: {
                                label: "Start new bag",
                                onClick: () => {
                                  addItem(stall, line);
                                  toast.success(`${item.name} added`, { id: "bag-add", duration: 1500 });
                                },
                              },
                              cancel: { label: "Keep bag", onClick: () => {} },
                            });
                            return;
                          }
                          addItem(stall, line);
                          const inBag = cart.items.reduce((sum, l) => sum + l.qty, 0) + 1;
                          toast.success(`${item.name} added`, {
                            id: "bag-add",
                            description: `${inBag} item${inBag > 1 ? "s" : ""} in your bag from ${stall.name}.`,
                            duration: 1500,
                          });
                        }}
                      >
                        {qty > 0 ? `Add · ${qty}` : "Add"}
                      </Button>
                    ) : (
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">
                        Sold out
                      </span>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function DietaryLine({ item }: { item: MenuItemData }) {
  const allergens = allergenLabels(item.allergens);
  const tags = [
    item.egg ? "Egg" : null,
    item.veg && item.jain ? "Jain" : null,
    item.kcal ? `${item.kcal} kcal` : null,
  ].filter(Boolean);
  if (!tags.length && !allergens.length) return null;
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
      {tags.map((tag) => (
        <span key={tag} className="rounded-md bg-muted px-1.5 py-0.5 font-medium">
          {tag}
        </span>
      ))}
      {allergens.length ? <span className="text-muted-foreground">Contains {allergens.join(", ").toLowerCase()}</span> : null}
    </p>
  );
}
