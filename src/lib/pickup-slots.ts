import { campusMinutesNow, crossesMidnight, formatHm, isAllDay, parseHm } from "@/lib/hours";

const SLOT_MINUTES = 15;
// Earliest pickup is this far out, or the kitchen's current wait if longer.
export const KITCHEN_LEAD_MINUTES = 10;
const BOOKING_HORIZON_MINUTES = 180;
const DAY_MINUTES = 24 * 60;

export type PickupSlot = {
  value: string;
  label: string;
  // Set by the checkout page from today's bookings.
  full?: boolean;
  left?: number;
};

export function getPickupSlots(
  openTime: string,
  closeTime: string,
  date = new Date(),
  leadMinutes = KITCHEN_LEAD_MINUTES,
): PickupSlot[] {
  let now = campusMinutesNow(date);
  const allDay = isAllDay(openTime, closeTime);
  const open = allDay ? 0 : parseHm(openTime);
  let close = allDay ? Number.POSITIVE_INFINITY : parseHm(closeTime);
  // A counter open past midnight: count its closing time on the next day, and
  // count "now" there too when it is already after midnight.
  if (crossesMidnight(openTime, closeTime)) {
    close += DAY_MINUTES;
    if (now < parseHm(closeTime)) now += DAY_MINUTES;
  }

  const first =
    Math.ceil(Math.max(now + Math.max(KITCHEN_LEAD_MINUTES, leadMinutes), open) / SLOT_MINUTES) * SLOT_MINUTES;
  const last = Math.min(close - 1, Math.max(now, open) + BOOKING_HORIZON_MINUTES);

  const slots: PickupSlot[] = [];
  for (let t = first; t <= last; t += SLOT_MINUTES) {
    const value = formatHm(t % DAY_MINUTES);
    slots.push({ value, label: value });
  }
  return slots;
}

export function isValidPickupSlot(
  value: string,
  openTime: string,
  closeTime: string,
  date = new Date(),
  leadMinutes = KITCHEN_LEAD_MINUTES,
) {
  return getPickupSlots(openTime, closeTime, date, leadMinutes).some((slot) => slot.value === value);
}
