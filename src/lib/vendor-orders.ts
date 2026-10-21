import { paymentLabel } from "@/lib/orders";

export type VendorOrder = {
  id: string;
  token: string;
  status: string;
  pickupSlot: string;
  paymentLabel: string;
  totalInr: number;
  employeeName: string;
  cancelReason: string | null;
  createdAt: string;
  readyAt: string | null;
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
  paymentMethod: string;
  totalInr: number;
  employeeName: string;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: Date;
  readyAt: Date | null;
  note: string | null;
  items: { id: string; name: string; qty: number; veg: boolean }[];
}): VendorOrder {
  return {
    id: order.id,
    token: order.token,
    status: order.status,
    pickupSlot: order.pickupSlot,
    paymentLabel: paymentLabel(order.paymentMethod),
    totalInr: order.totalInr,
    employeeName: order.employeeName,
    cancelReason: order.cancelledBy === "employee" ? "Cancelled by the employee" : order.cancelReason,
    createdAt: order.createdAt.toISOString(),
    readyAt: order.readyAt?.toISOString() ?? null,
    note: order.note,
    items: order.items,
  };
}

export const vendorOrderInclude = {
  items: {
    select: { id: true, name: true, qty: true, veg: true },
  },
} as const;
