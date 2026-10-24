"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useCart } from "@/components/cart-provider";
import { QtyStepper } from "@/components/qty-stepper";
import { VegDot } from "@/components/veg-dot";
import { Button } from "@/components/ui/button";
import { addBlocker, cartCount } from "@/lib/cart";
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
  const inBag = cart.stalls.find((s) => s.id === stall.id);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const keep = FILTERS.find((f) => f.id === filter)!.keep;
  const shown = items.filter(keep);
  const categories = [...new Set(shown.map((item) => item.category))].sort(
    (a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b),
  );
  // Only offer filters that would leave something on this menu.
  const filters = FILTERS.filter((f) => f.id === "all" || (items.some(f.keep) && !items.every(f.keep)));

  return (
    <div className="space-y-8 pb-24">
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
      {filter === "noegg" ? (
        <p className="-mt-5 text-xs text-muted-foreground">
          Hides dishes the stall has marked as containing egg. Ask the counter if you are unsure about an item.
        </p>
      ) : filter === "jain" ? (
        <p className="-mt-5 text-xs text-muted-foreground">Shows dishes the stall has marked as Jain.</p>
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
                const qty = inBag?.items.find((line) => line.menuItemId === item.id)?.qty ?? 0;
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
                      <AddOrStepper
                        menuItemId={item.id}
                        name={item.name}
                        qty={qty}
                        onAdd={() => {
                          const blocked = addBlocker(cart, stall.id, item.id);
                          if (blocked) {
                            toast.error(blocked, { id: "bag-add", duration: 6000 });
                            return;
                          }
                          addItem(stall, {
                            menuItemId: item.id,
                            name: item.name,
                            priceInr: effectivePrice(item),
                            veg: item.veg,
                          });
                          const items = cartCount(cart) + 1;
                          const stalls = cart.stalls.length + (inBag ? 0 : 1);
                          toast.success(`${item.name} added`, {
                            id: "bag-add",
                            description:
                              stalls > 1
                                ? `${items} items from ${stalls} stalls. You pay once and get a token for each stall.`
                                : `${items} item${items > 1 ? "s" : ""} in your bag from ${stall.name}.`,
                            // Long enough to read the first time a second stall joins the bag.
                            duration: stalls > 1 && !inBag ? 4000 : 1500,
                          });
                        }}
                      />
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

// "Add" until the dish is in the bag, then − qty + in its place. When one
// replaces the other under the person's own click, focus moves to the new
// control so a keyboard user keeps their place in the menu.
function AddOrStepper({
  menuItemId,
  name,
  qty,
  onAdd,
}: {
  menuItemId: string;
  name: string;
  qty: number;
  onAdd: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const swapping = useRef(false);
  const inBag = qty > 0;

  useEffect(() => {
    if (!swapping.current) return;
    swapping.current = false;
    const buttons = box.current?.querySelectorAll("button");
    // The stepper's +, or Add again after − took the last one out.
    buttons?.[inBag ? buttons.length - 1 : 0]?.focus();
  }, [inBag]);

  return (
    <div
      ref={box}
      className="shrink-0"
      onClickCapture={(event) => {
        // Add, or − on the last one: the only clicks that swap the control.
        const button = (event.target as HTMLElement).closest("button");
        swapping.current = !inBag || (qty === 1 && button === box.current?.querySelector("button"));
        // The swap renders before this runs; a refused Add leaves nothing to swap.
        setTimeout(() => {
          swapping.current = false;
        });
      }}
    >
      {inBag ? (
        <QtyStepper menuItemId={menuItemId} name={name} qty={qty} />
      ) : (
        <Button variant="outline" onClick={onAdd}>
          Add
        </Button>
      )}
    </div>
  );
}
