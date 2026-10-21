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
import { MAX_QTY_PER_LINE } from "@/lib/validation";

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
  setPrices: (prices: Record<string, number>) => void;
  replace: (stall: { id: string; name: string }, lines: CartLine[]) => void;
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

function isCartLine(value: unknown): value is CartLine {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.menuItemId === "string" &&
    typeof line.name === "string" &&
    Number.isInteger(line.priceInr) &&
    typeof line.veg === "boolean" &&
    Number.isInteger(line.qty) &&
    (line.qty as number) > 0
  );
}

// A saved bag from an older build or a hand-edited one must not crash the header.
function readStorage(): CartState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return EMPTY_CART;
    const parsed = JSON.parse(raw) as Partial<CartState>;
    if (typeof parsed.stallId !== "string" || typeof parsed.stallName !== "string") return EMPTY_CART;
    if (!Array.isArray(parsed.items) || !parsed.items.every(isCartLine) || !parsed.items.length) {
      return EMPTY_CART;
    }
    return {
      stallId: parsed.stallId,
      stallName: parsed.stallName,
      items: parsed.items.map((line) => ({ ...line, qty: Math.min(line.qty, MAX_QTY_PER_LINE) })),
    };
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
            line.menuItemId === item.menuItemId
              ? { ...line, qty: Math.min(line.qty + 1, MAX_QTY_PER_LINE) }
              : line,
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
            line.menuItemId === menuItemId ? { ...line, qty: Math.min(qty, MAX_QTY_PER_LINE) } : line,
          );
    writeCart(items.length ? { ...prev, items } : EMPTY_CART);
  }, []);

  const setPrices = useCallback((prices: Record<string, number>) => {
    const prev = getSnapshot();
    writeCart({
      ...prev,
      items: prev.items.map((line) =>
        prices[line.menuItemId] === undefined ? line : { ...line, priceInr: prices[line.menuItemId] },
      ),
    });
  }, []);

  const clear = useCallback(() => writeCart(EMPTY_CART), []);

  const replace = useCallback((stall: { id: string; name: string }, lines: CartLine[]) => {
    writeCart({
      stallId: stall.id,
      stallName: stall.name,
      items: lines.map((line) => ({ ...line, qty: Math.min(Math.max(1, line.qty), MAX_QTY_PER_LINE) })),
    });
  }, []);

  const value = useMemo(
    () => ({
      cart,
      count: cartCount(cart),
      total: cartTotal(cart),
      hydrated,
      addItem,
      setQty,
      setPrices,
      replace,
      clear,
    }),
    [addItem, cart, clear, hydrated, replace, setPrices, setQty],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
