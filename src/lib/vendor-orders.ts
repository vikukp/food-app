import { paymentLabel } from "@/lib/orders";

export type VendorOrder = {
  id: string;
  token: string;
  status: string;
  pickupSlot: string;
  paymentLabel: string;
  totalInr: number;
  employeeName: string;
  createdAt: string;
  items: { id: string; name: string; qty: number; veg: boolean }[];
};

export function toVendorOrder(order: {
  id: string;
  token: string;
  status: string;
  pickupSlot: string;
  paymentMethod: string;
  totalInr: number;
  employeeName: string;
  createdAt: Date;
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
    createdAt: order.createdAt.toISOString(),
    items: order.items,
  };
}

export const vendorOrderInclude = {
  items: {
    select: { id: true, name: true, qty: true, veg: true },
  },
} as const;
