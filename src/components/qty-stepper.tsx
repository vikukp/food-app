"use client";

import { useCart } from "@/components/cart-provider";
import { Button } from "@/components/ui/button";
import { MAX_QTY_PER_LINE } from "@/lib/validation";

// − qty + for one bag line. 40px targets: easy to hit with a thumb.
export function QtyStepper({ menuItemId, name, qty }: { menuItemId: string; name: string; qty: number }) {
  const { setQty } = useCart();
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        size="icon"
        variant="outline"
        className="size-10"
        aria-label={qty === 1 ? `Remove ${name}` : `One less ${name}`}
        onClick={() => setQty(menuItemId, qty - 1)}
      >
        −
      </Button>
      <span className="w-6 text-center text-sm tabular-nums" aria-label={`${qty} in bag`}>
        {qty}
      </span>
      <Button
        size="icon"
        variant="outline"
        className="size-10"
        aria-label={`One more ${name}`}
        disabled={qty >= MAX_QTY_PER_LINE}
        onClick={() => setQty(menuItemId, qty + 1)}
      >
        +
      </Button>
    </div>
  );
}
