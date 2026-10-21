import { randomInt } from "node:crypto";

export const ORDER_STATUSES = [
  "PLACED",
  "PREPARING",
  "READY",
  "COLLECTED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(value: string): value is OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus);
}

export function nextStatus(status: OrderStatus): OrderStatus | null {
  if (status === "PLACED") return "PREPARING";
  if (status === "PREPARING") return "READY";
  if (status === "READY") return "COLLECTED";
  return null;
}

export function statusLabel(status: string) {
  switch (status) {
    case "PLACED":
      return "Order placed";
    case "PREPARING":
      return "Preparing";
    case "READY":
      return "Ready for pickup";
    case "COLLECTED":
      return "Collected";
    default:
      return status;
  }
}

// Unique per stall per campus day; the database enforces it and the caller retries on a clash.
export function randomToken() {
  return `IWF-${randomInt(1000, 10000)}`;
}

export function paymentLabel(method: string) {
  if (method === "PLUXEE") return "Pluxee";
  if (method === "UPI") return "UPI";
  if (method === "CARD") return "Card";
  return method;
}
