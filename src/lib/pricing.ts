export type Priced = {
  priceInr: number;
  offerPriceInr?: number | null;
  offerLabel?: string | null;
};

export function hasOffer(item: Priced) {
  return item.offerPriceInr != null && item.offerPriceInr > 0 && item.offerPriceInr < item.priceInr;
}

export function effectivePrice(item: Priced) {
  return hasOffer(item) ? (item.offerPriceInr as number) : item.priceInr;
}

export function offerPercent(item: Priced) {
  if (!hasOffer(item)) return 0;
  return Math.round((1 - (item.offerPriceInr as number) / item.priceInr) * 100);
}
