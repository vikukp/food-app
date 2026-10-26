import { CAMPUS_TIME_ZONE, campusClockTime, campusDate } from "@/lib/hours";
import type { VendorOrder } from "@/lib/vendor-orders";

// What the counter says about a ticket it has just scanned or typed in. An
// order is handed over once, so a copy of its QR shown after that, or the QR
// of a cancelled order, gets a warning and never the food. A typed token gets
// a name check: tokens are on the public ready board, names are not.
export type TicketCheck = { level: "stop" | "check"; text: string };

const day = new Intl.DateTimeFormat("en-IN", { timeZone: CAMPUS_TIME_ZONE, day: "numeric", month: "short" });

// " at 12:41", or " on 24 Oct at 12:41" on another day; nothing if not known.
function when(iso: string | null, now: number) {
  if (!iso) return "";
  const date = new Date(iso);
  const time = campusClockTime(date);
  return campusDate(date) === campusDate(new Date(now)) ? ` at ${time}` : ` on ${day.format(date)} at ${time}`;
}

export function ticketCheck(order: VendorOrder, by: "scan" | "typed", now = Date.now()): TicketCheck | null {
  if (order.status === "COLLECTED") {
    return {
      level: "stop",
      text: `Already collected${when(order.collectedAt, now)}. This ticket has been used: don't hand anything over.`,
    };
  }
  if (order.status === "CANCELLED") {
    return { level: "stop", text: `Cancelled${when(order.cancelledAt, now)} and refunded. Don't hand anything over.` };
  }
  if (order.status === "READY" && by === "typed") {
    return { level: "check", text: `Token typed in, not scanned. Ask their name before handing over: ${order.employeeName}.` };
  }
  return null;
}
