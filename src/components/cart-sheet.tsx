"use client";

import Link from "next/link";
import { ShoppingBagIcon } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/components/cart-provider";
import { QtyStepper } from "@/components/qty-stepper";
import { VegDot } from "@/components/veg-dot";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { stallTotal } from "@/lib/cart";
import { formatInr } from "@/lib/money";

export function CartButton() {
  const { count, hydrated } = useCart();
  if (!hydrated) {
    return (
      <Button variant="ghost" size="sm" className="text-emerald-50" disabled>
        <ShoppingBagIcon />
        Bag
      </Button>
    );
  }
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="relative text-emerald-50 hover:bg-white/10 hover:text-white"
          />
        }
      >
        <ShoppingBagIcon />
        Bag
        {count > 0 ? (
          <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-semibold text-emerald-950">
            {count}
          </span>
        ) : null}
      </SheetTrigger>
      <SheetContent side="right" className="bg-background">
        <CartPanel />
      </SheetContent>
    </Sheet>
  );
}

function CartPanel() {
  const { cart, total, clear, restore } = useCart();
  const { stalls } = cart;
  return (
    <>
      <SheetHeader>
        <SheetTitle>Your bag</SheetTitle>
        <SheetDescription>
          {stalls.length === 0
            ? "Add items from a stall to start an order."
            : stalls.length === 1
              ? `From ${stalls[0].name}. You can add dishes from other stalls too.`
              : `From ${stalls.length} stalls. You pay once and get a token for each stall.`}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4">
        {stalls.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing in the bag yet. Browse a stall and add lunch.
          </p>
        ) : (
          stalls.map((stall) => (
            <section key={stall.id} aria-label={stall.name}>
              <h3 className="flex items-baseline justify-between gap-2 text-sm font-semibold">
                <span className="break-words">{stall.name}</span>
                <span className="shrink-0 font-normal text-muted-foreground tabular-nums">{formatInr(stallTotal(stall))}</span>
              </h3>
              {stall.items.map((item) => (
                <div key={item.menuItemId} className="flex items-start justify-between gap-3 border-b border-border/70 py-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <VegDot veg={item.veg} />
                      <span className="break-words">{item.name}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{formatInr(item.priceInr)} each</p>
                  </div>
                  <QtyStepper menuItemId={item.menuItemId} name={item.name} qty={item.qty} />
                </div>
              ))}
            </section>
          ))
        )}
      </div>
      <SheetFooter>
        {stalls.length > 0 ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold">{formatInr(total)}</span>
            </div>
            <Button className="h-10 w-full" render={<Link href="/checkout" />}>
              {stalls.length > 1 ? "Choose pickup times" : "Choose pickup time"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                const before = cart;
                clear();
                toast("Bag cleared", { action: { label: "Undo", onClick: () => restore(before) } });
              }}
            >
              Clear bag
            </Button>
          </>
        ) : (
          <Button variant="outline" render={<Link href="/stalls" />}>
            Browse stalls
          </Button>
        )}
      </SheetFooter>
    </>
  );
}

export function MobileCartBar() {
  const { cart, count, total, hydrated } = useCart();
  if (!hydrated || count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 p-3 backdrop-blur md:hidden">
      <Button className="h-11 w-full justify-between px-4" render={<Link href="/checkout" />}>
        <span className="truncate">
          {count} item{count === 1 ? "" : "s"} ·{" "}
          {cart.stalls.length === 1 ? cart.stalls[0].name : `${cart.stalls.length} stalls`}
        </span>
        <span>{formatInr(total)}</span>
      </Button>
    </div>
  );
}
