"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import {
  CART_STORAGE_KEY,
  EMPTY_CART,
  cartCount,
  cartTotal,
  type CartLine,
  type CartState,
} from "@/lib/cart";

type CartContextValue = {
  cart: CartState;
  count: number;
  total: number;
  hydrated: boolean;
  addItem: (
    stall: { id: string; name: string },
    item: Omit<CartLine, "qty">,
  ) => { replaced: boolean };
  setQty: (menuItemId: string, qty: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

let snapshot: CartState = EMPTY_CART;
let didRead = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function readStorage(): CartState {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartState) : EMPTY_CART;
  } catch {
    return EMPTY_CART;
  }
}

function getSnapshot() {
  if (!didRead) {
    snapshot = readStorage();
    didRead = true;
  }
  return snapshot;
}

function getServerSnapshot() {
  return EMPTY_CART;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function writeCart(next: CartState) {
  snapshot = next;
  didRead = true;
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked (private mode, embedded webview, quota): keep the bag in memory for this tab.
  }
  emit();
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const cart = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const addItem = useCallback(
    (stall: { id: string; name: string }, item: Omit<CartLine, "qty">) => {
      let replaced = false;
      const prev = getSnapshot();
      if (prev.stallId && prev.stallId !== stall.id && prev.items.length) {
        replaced = true;
        writeCart({
          stallId: stall.id,
          stallName: stall.name,
          items: [{ ...item, qty: 1 }],
        });
        return { replaced };
      }
      const existing = prev.items.find((line) => line.menuItemId === item.menuItemId);
      const items = existing
        ? prev.items.map((line) =>
            line.menuItemId === item.menuItemId ? { ...line, qty: line.qty + 1 } : line,
          )
        : [...prev.items, { ...item, qty: 1 }];
      writeCart({ stallId: stall.id, stallName: stall.name, items });
      return { replaced };
    },
    [],
  );

  const setQty = useCallback((menuItemId: string, qty: number) => {
    const prev = getSnapshot();
    const items =
      qty <= 0
        ? prev.items.filter((line) => line.menuItemId !== menuItemId)
        : prev.items.map((line) =>
            line.menuItemId === menuItemId ? { ...line, qty } : line,
          );
    writeCart(items.length ? { ...prev, items } : EMPTY_CART);
  }, []);

  const clear = useCallback(() => writeCart(EMPTY_CART), []);

  const value = useMemo(
    () => ({
      cart,
      count: cartCount(cart),
      total: cartTotal(cart),
      hydrated,
      addItem,
      setQty,
      clear,
    }),
    [addItem, cart, clear, hydrated, setQty],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
