"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import {
  CART_STORAGE_KEY,
  EMPTY_CART,
  addToCart,
  applyPrices,
  cartCount,
  cartTotal,
  parseStoredCart,
  putStallLines,
  removeStall as withoutStall,
  setLineQty,
  type CartLine,
  type CartState,
} from "@/lib/cart";

type Stall = { id: string; name: string };

type CartContextValue = {
  cart: CartState;
  count: number;
  total: number;
  hydrated: boolean;
  // False when the bag cannot take it (see addBlocker in lib/cart).
  addItem: (stall: Stall, item: Omit<CartLine, "qty">) => boolean;
  setQty: (menuItemId: string, qty: number) => void;
  setPrices: (prices: Record<string, number>) => void;
  // "Order again". False when the stall is new and the bag already holds the most stalls.
  putLines: (stall: Stall, lines: CartLine[]) => boolean;
  removeStall: (stallId: string) => void;
  restore: (cart: CartState) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

let snapshot: CartState = EMPTY_CART;
let didRead = false;
// Each employee gets their own saved bag, so whoever signs in next on a shared
// device starts empty. Set by the provider before anything reads the bag.
let storageKey = CART_STORAGE_KEY;

function selectOwner(owner: string) {
  const key = `${CART_STORAGE_KEY}:${owner}`;
  if (key !== storageKey) {
    storageKey = key;
    didRead = false;
    try {
      // Bags from before they were per employee belong to nobody in particular.
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch {}
  }
}
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function readStorage(): CartState {
  try {
    return parseStoredCart(localStorage.getItem(storageKey));
  } catch {
    // Storage blocked: start empty.
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

// Another tab paid for or changed the bag: re-read it, so this tab cannot
// place the same order twice or overwrite the other tab's edits.
function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== storageKey) return;
  didRead = false;
  emit();
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function writeCart(next: CartState) {
  snapshot = next;
  didRead = true;
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // Storage blocked (private mode, embedded webview, quota): keep the bag in memory for this tab.
  }
  emit();
}

export function CartProvider({ owner, children }: { owner: string; children: React.ReactNode }) {
  selectOwner(owner);
  const cart = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const addItem = useCallback((stall: Stall, item: Omit<CartLine, "qty">) => {
    const prev = getSnapshot();
    const next = addToCart(prev, stall, item);
    if (next === prev) return false;
    writeCart(next);
    return true;
  }, []);

  const setQty = useCallback((menuItemId: string, qty: number) => {
    writeCart(setLineQty(getSnapshot(), menuItemId, qty));
  }, []);

  const setPrices = useCallback((prices: Record<string, number>) => {
    writeCart(applyPrices(getSnapshot(), prices));
  }, []);

  const putLines = useCallback((stall: Stall, lines: CartLine[]) => {
    const next = putStallLines(getSnapshot(), stall, lines);
    if (next) writeCart(next);
    return next !== null;
  }, []);

  const removeStall = useCallback((stallId: string) => writeCart(withoutStall(getSnapshot(), stallId)), []);
  const restore = useCallback((saved: CartState) => writeCart(saved), []);
  const clear = useCallback(() => writeCart(EMPTY_CART), []);

  const value = useMemo(
    () => ({
      cart,
      count: cartCount(cart),
      total: cartTotal(cart),
      hydrated,
      addItem,
      setQty,
      setPrices,
      putLines,
      removeStall,
      restore,
      clear,
    }),
    [addItem, cart, clear, hydrated, putLines, removeStall, restore, setPrices, setQty],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
