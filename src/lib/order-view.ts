import QRCode from "qrcode";
import { buildQrPayload } from "@/lib/qr";
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
  createdAt: Date;
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
  createdAt: string;
  items: { id: string; name: string; qty: number; priceInr: number; veg: boolean }[];
  qrDataUrl: string;
};

export type OrderStatusUpdate = Pick<OrderView, "status" | "statusLabel">;

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
    createdAt: order.createdAt.toISOString(),
    items: order.items,
    qrDataUrl,
  };
}
