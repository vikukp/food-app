import { campusDate, campusMinutesNow, crossesMidnight, formatHm, isAllDay, parseHm } from "@/lib/hours";

const SLOT_MINUTES = 15;
// Earliest pickup is this far out, or the kitchen's current wait if longer.
export const KITCHEN_LEAD_MINUTES = 10;
const BOOKING_HORIZON_MINUTES = 180;
const DAY_MINUTES = 24 * 60;

export type PickupSlot = {
  value: string;
  label: string;
  // The real moment of the slot (ms since epoch): "00:30" booked at 22:00 is
  // tomorrow's 00:30. Capacity is counted by this, not by the "HH:MM" text.
  at: number;
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
  // Minutes on the timeline below are counted from this campus midnight.
  let midnight = campusMidnight(date);
  const allDay = isAllDay(openTime, closeTime);
  const open = allDay ? 0 : parseHm(openTime);
  let close = allDay ? Number.POSITIVE_INFINITY : parseHm(closeTime);
  // A counter open past midnight: count its closing time on the next day, and
  // count "now" there too when it is already after midnight.
  if (crossesMidnight(openTime, closeTime)) {
    close += DAY_MINUTES;
    if (now < parseHm(closeTime)) {
      now += DAY_MINUTES;
      midnight -= DAY_MINUTES * 60_000;
    }
  }

  const first =
    Math.ceil(Math.max(now + Math.max(KITCHEN_LEAD_MINUTES, leadMinutes), open) / SLOT_MINUTES) * SLOT_MINUTES;
  const last = Math.min(close - 1, Math.max(now, open) + BOOKING_HORIZON_MINUTES);

  const slots: PickupSlot[] = [];
  for (let t = first; t <= last; t += SLOT_MINUTES) {
    const value = formatHm(t % DAY_MINUTES);
    slots.push({ value, label: value, at: midnight + t * 60_000 });
  }
  return slots;
}

// Start of the campus day that `date` falls in.
export function campusMidnight(date = new Date()) {
  return new Date(`${campusDate(date)}T00:00:00+05:30`).getTime();
}

export function isValidPickupSlot(
  value: string,
  openTime: string,
  closeTime: string,
  date = new Date(),
  leadMinutes = KITCHEN_LEAD_MINUTES,
) {
  return findPickupSlot(value, openTime, closeTime, date, leadMinutes) !== undefined;
}

export function findPickupSlot(
  value: string,
  openTime: string,
  closeTime: string,
  date = new Date(),
  leadMinutes = KITCHEN_LEAD_MINUTES,
) {
  return getPickupSlots(openTime, closeTime, date, leadMinutes).find((slot) => slot.value === value);
}
