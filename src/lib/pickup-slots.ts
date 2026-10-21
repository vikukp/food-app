import { campusMinutesNow, crossesMidnight, formatHm, isAllDay, parseHm } from "@/lib/hours";

const SLOT_MINUTES = 15;
const KITCHEN_LEAD_MINUTES = 10;
const BOOKING_HORIZON_MINUTES = 180;
const DAY_MINUTES = 24 * 60;

export type PickupSlot = {
  value: string;
  label: string;
};

export function getPickupSlots(
  openTime: string,
  closeTime: string,
  date = new Date(),
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
    Math.ceil(Math.max(now + KITCHEN_LEAD_MINUTES, open) / SLOT_MINUTES) * SLOT_MINUTES;
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
) {
  return getPickupSlots(openTime, closeTime, date).some((slot) => slot.value === value);
}
