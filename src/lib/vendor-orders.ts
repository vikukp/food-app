import { paymentLabel } from "@/lib/orders";

export type VendorOrder = {
  id: string;
  token: string;
  status: string;
  pickupSlot: string;
  // When that slot is (ISO); null on orders from before it was stored.
  pickupAt: string | null;
  paymentLabel: string;
  totalInr: number;
  employeeName: string;
  cancelReason: string | null;
  createdAt: string;
  readyAt: string | null;
  collectedAt: string | null;
  cancelledAt: string | null;
  note: string | null;
  // Set on the client for an order pulled in by "Find token" or a QR scan.
  found?: boolean;
  items: { id: string; name: string; qty: number; veg: boolean }[];
};

export type VendorDaySummary = {
  orders: number;
  revenueInr: number;
  cancelled: number;
  topItems: { name: string; qty: number }[];
};

export type VendorQueueSnapshot = { orders: VendorOrder[]; summary: VendorDaySummary };

export function toVendorOrder(order: {
  id: string;
  token: string;
  status: string;
  pickupSlot: string;
  pickupAt: Date | null;
  paymentMethod: string;
  totalInr: number;
  employeeName: string;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: Date;
  readyAt: Date | null;
  collectedAt: Date | null;
  cancelledAt: Date | null;
  note: string | null;
  items: { id: string; name: string; qty: number; veg: boolean }[];
}): VendorOrder {
  return {
    id: order.id,
    token: order.token,
    status: order.status,
    pickupSlot: order.pickupSlot,
    pickupAt: order.pickupAt?.toISOString() ?? null,
    paymentLabel: paymentLabel(order.paymentMethod),
    totalInr: order.totalInr,
    employeeName: order.employeeName,
    cancelReason: order.cancelledBy === "employee" ? "Cancelled by the employee" : order.cancelReason,
    createdAt: order.createdAt.toISOString(),
    readyAt: order.readyAt?.toISOString() ?? null,
    collectedAt: order.collectedAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    note: order.note,
    items: order.items,
  };
}

export const vendorOrderInclude = {
  items: {
    select: { id: true, name: true, qty: true, veg: true },
  },
} as const;
