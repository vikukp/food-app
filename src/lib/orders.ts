import { randomInt } from "node:crypto";

export const ORDER_STATUSES = [
  "PLACED",
  "PREPARING",
  "READY",
  "COLLECTED",
  "CANCELLED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export function isOrderStatus(value: string): value is OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus);
}

// Still with the kitchen or on the counter, as opposed to finished.
export const OPEN_STATUSES = ["PLACED", "PREPARING", "READY"] as const;

export function isOpenStatus(status: string) {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

// An employee can undo an order only just after paying (a wrong dish or slot,
// a double tap), and only before the kitchen starts. After that the counter can
// cancel it for them; the stall can until the food is ready.
export const EMPLOYEE_CANCEL_MS = 30_000;

export function employeeCanCancel(order: { status: string; createdAt: Date | string }, now = Date.now()) {
  return order.status === "PLACED" && now - new Date(order.createdAt).getTime() < EMPLOYEE_CANCEL_MS;
}

// Before the food is ready, with a reason; once ready, only as a no-show.
export function stallCanCancel(status: string) {
  return status === "PLACED" || status === "PREPARING" || status === "READY";
}

export const STALL_CANCEL_REASONS = [
  "An item ran out",
  "Kitchen is closing",
  "Too busy to make it in time",
] as const;

export const NO_SHOW_REASON = "Not collected";
// A ready order can be closed as a no-show only after it has waited this long,
// so a tap right after "Mark ready" cannot cancel food someone is walking to.
export const NO_SHOW_AFTER_MS = 10 * 60_000;

export function cancelReasonsFor(status: string): readonly string[] {
  if (status === "READY") return [NO_SHOW_REASON];
  return stallCanCancel(status) ? STALL_CANCEL_REASONS : [];
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
    case "CANCELLED":
      return "Cancelled";
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
