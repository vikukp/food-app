"use client";

import { toast } from "sonner";
import { useCart } from "@/components/cart-provider";
import { VegDot } from "@/components/veg-dot";
import { Button } from "@/components/ui/button";
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
  category: string;
  available: boolean;
};

export function MenuList({
  stall,
  items,
}: {
  stall: { id: string; name: string };
  items: MenuItemData[];
}) {
  const { addItem, cart } = useCart();
  const categories = [...new Set(items.map((item) => item.category))];

  return (
    <div className="space-y-8 pb-24 md:pb-8">
      {categories.map((category) => (
        <section key={category}>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {category}
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            {items
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
                        <VegDot veg={item.veg} />
                        {item.name}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
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
                          const { replaced } = addItem(stall, {
                            menuItemId: item.id,
                            name: item.name,
                            priceInr: effectivePrice(item),
                            veg: item.veg,
                          });
                          if (replaced) {
                            toast.message("Bag reset", {
                              description: `Items from the other stall were cleared. Now ordering from ${stall.name}.`,
                            });
                          } else {
                            toast.success(`${item.name} added`, {
                              id: "bag-add",
                              description: `${qty + 1} in your bag from ${stall.name}.`,
                              duration: 1500,
                            });
                          }
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
