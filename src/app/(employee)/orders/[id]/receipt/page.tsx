import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { gstBreakup } from "@/lib/gst";
import { campusClockTime } from "@/lib/hours";
import { formatInr } from "@/lib/money";
import { paymentLabel, statusLabel } from "@/lib/orders";
import { prisma } from "@/lib/prisma";
import { getEmployeeSession } from "@/lib/session";

export const metadata = { title: "Receipt" };

const day = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const rupees = (inr: number) => `₹${inr.toFixed(2)}`;

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getEmployeeSession();
  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true, stall: { select: { name: true, location: true, gstin: true } } },
  });
  if (!order || !session || order.employeeId !== session.employeeId) notFound();
  const cancelled = order.status === "CANCELLED";
  const gst = gstBreakup(order.totalInr);

  return (
    <main className="mx-auto w-full max-w-md px-4 py-8 print:py-0">
      <div className="rounded-xl border bg-card p-5 text-sm print:border-0">
        <h1 className="text-lg font-semibold">{order.stall.name}</h1>
        <p className="text-muted-foreground">HPE IWF Campus Food Court · {order.stall.location}</p>
        <p className="text-muted-foreground">GSTIN: {order.stall.gstin ?? "not provided by the stall"}</p>
        <dl className="mt-4 grid grid-cols-2 gap-y-1">
          <dt className="text-muted-foreground">Receipt for</dt>
          <dd className="text-right font-mono">{order.token}</dd>
          <dt className="text-muted-foreground">Date</dt>
          <dd className="text-right">
            {day.format(order.createdAt)}, {campusClockTime(order.createdAt)} IST
          </dd>
          <dt className="text-muted-foreground">Employee</dt>
          <dd className="text-right">
            {order.employeeName} · {order.employeeId}
          </dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="text-right">{statusLabel(order.status)}</dd>
        </dl>
        <table className="mt-4 w-full">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Item</th>
              <th className="py-1 text-right font-medium">Qty</th>
              <th className="py-1 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id}>
                <td className="py-1">{item.name}</td>
                <td className="py-1 text-right tabular-nums">
                  {item.qty} × {formatInr(item.priceInr)}
                </td>
                <td className="py-1 text-right tabular-nums">{formatInr(item.qty * item.priceInr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-3 grid grid-cols-2 gap-y-1 border-t pt-3 tabular-nums">
          <dt className="text-muted-foreground">Taxable value</dt>
          <dd className="text-right">{rupees(gst.taxableInr)}</dd>
          <dt className="text-muted-foreground">CGST {gst.ratePercent / 2}%</dt>
          <dd className="text-right">{rupees(gst.cgstInr)}</dd>
          <dt className="text-muted-foreground">SGST {gst.ratePercent / 2}%</dt>
          <dd className="text-right">{rupees(gst.sgstInr)}</dd>
          <dt className="font-semibold">Total (incl. GST)</dt>
          <dd className="text-right font-semibold">{rupees(gst.totalInr)}</dd>
        </dl>
        <p className="mt-3 text-muted-foreground">
          {cancelled ? "Refunded to" : "Paid with"} {paymentLabel(order.paymentMethod)} · Ref {order.paymentRef}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">Mock payment for the campus demo; not a tax invoice.</p>
      </div>
      <div className="mt-4 flex gap-2 print:hidden">
        <Link href={`/orders/${order.id}`} className="flex-1 rounded-lg border px-3 py-2 text-center text-sm">
          Back to ticket
        </Link>
        <PrintButton />
      </div>
    </main>
  );
}
