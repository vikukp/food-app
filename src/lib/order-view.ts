import QRCode from "qrcode";
import { buildQrPayload } from "@/lib/qr";
import { campusClockTime } from "@/lib/hours";
import { paymentLabel, statusLabel } from "@/lib/orders";

export type OrderRecord = {
  id: string;
  token: string;
  status: string;
  pickupSlot: string;
  paymentMethod: string;
  paymentRef: string;
  totalInr: number;
  employeeName: string;
  employeeId: string;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: Date;
  rating: number | null;
  note: string | null;
  preparingAt: Date | null;
  readyAt: Date | null;
  collectedAt: Date | null;
  cancelledAt: Date | null;
  stall: { name: string; location: string };
  items: { id: string; name: string; qty: number; priceInr: number; veg: boolean }[];
};

export type OrderView = {
  id: string;
  token: string;
  status: string;
  statusLabel: string;
  pickupSlot: string;
  paymentMethod: string;
  paymentLabel: string;
  paymentRef: string;
  totalInr: number;
  employeeName: string;
  employeeId: string;
  stallName: string;
  stallLocation: string;
  // Shown on a cancelled ticket, e.g. "An item ran out" or "You cancelled this order".
  cancelNote: string | null;
  timeline: TimelineStep[];
  rating: number | null;
  note: string | null;
  createdAt: string;
  items: { id: string; name: string; qty: number; priceInr: number; veg: boolean }[];
  qrDataUrl: string;
};

export type TimelineStep = { label: string; at: string | null };

export type OrderStatusUpdate = Pick<OrderView, "status" | "statusLabel" | "cancelNote" | "timeline">;

type Stamps = Pick<OrderRecord, "status" | "createdAt" | "preparingAt" | "readyAt" | "collectedAt" | "cancelledAt">;

// Placed → Preparing → Ready → Collected, each with its campus time once it
// happened; a cancelled order ends at "Cancelled".
export function orderTimeline(order: Stamps): TimelineStep[] {
  const at = (date: Date | null) => (date ? campusClockTime(date) : null);
  const steps: TimelineStep[] = [{ label: "Placed", at: at(order.createdAt) }];
  if (order.status === "CANCELLED") {
    if (order.preparingAt) steps.push({ label: "Preparing", at: at(order.preparingAt) });
    steps.push({ label: "Cancelled", at: at(order.cancelledAt) ?? "" });
    return steps;
  }
  steps.push(
    { label: "Preparing", at: at(order.preparingAt) },
    { label: "Ready", at: at(order.readyAt) },
    { label: "Collected", at: at(order.collectedAt) },
  );
  return steps;
}

export function cancelNote(order: { status: string; cancelledBy: string | null; cancelReason: string | null }) {
  if (order.status !== "CANCELLED") return null;
  if (order.cancelledBy === "employee") return "You cancelled this order.";
  return `The stall cancelled this order${order.cancelReason ? `: ${order.cancelReason.toLowerCase()}` : ""}.`;
}

export async function toOrderView(order: OrderRecord): Promise<OrderView> {
  const payload = await buildQrPayload(order.token, order.id);
  const qrDataUrl = await QRCode.toDataURL(payload, {
    margin: 1,
    width: 280,
    color: { dark: "#0b3d32", light: "#ffffff" },
  });
  return {
    id: order.id,
    token: order.token,
    status: order.status,
    statusLabel: statusLabel(order.status),
    pickupSlot: order.pickupSlot,
    paymentMethod: order.paymentMethod,
    paymentLabel: paymentLabel(order.paymentMethod),
    paymentRef: order.paymentRef,
    totalInr: order.totalInr,
    employeeName: order.employeeName,
    employeeId: order.employeeId,
    stallName: order.stall.name,
    stallLocation: order.stall.location,
    cancelNote: cancelNote(order),
    timeline: orderTimeline(order),
    rating: order.rating,
    note: order.note,
    createdAt: order.createdAt.toISOString(),
    items: order.items,
    qrDataUrl,
  };
}
