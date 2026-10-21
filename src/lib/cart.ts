export type CartLine = {
  menuItemId: string;
  name: string;
  priceInr: number;
  veg: boolean;
  qty: number;
};

export type CartState = {
  stallId: string | null;
  stallName: string | null;
  items: CartLine[];
};

export const EMPTY_CART: CartState = {
  stallId: null,
  stallName: null,
  items: [],
};

export const CART_STORAGE_KEY = "iwf-food-cart-v1";

export function cartCount(cart: CartState) {
  return cart.items.reduce((sum, item) => sum + item.qty, 0);
}

export function cartTotal(cart: CartState) {
  return cart.items.reduce((sum, item) => sum + item.priceInr * item.qty, 0);
}
