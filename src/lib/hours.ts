export const CAMPUS_TIME_ZONE = "Asia/Kolkata";

const ALL_DAY_OPEN = "00:00";
const ALL_DAY_CLOSE = "23:59";

const campusClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: CAMPUS_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const campusDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAMPUS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// YYYY-MM-DD in campus time.
export function campusDate(date = new Date()) {
  return campusDay.format(date);
}

// The trading day an order belongs to. A counter open past midnight keeps the
// evening's date until it closes, so one shift is one day: one run of tokens,
// one "Today" summary.
export function serviceDay(openTime: string, closeTime: string, date = new Date()) {
  if (crossesMidnight(openTime, closeTime) && campusMinutesNow(date) < parseHm(closeTime)) {
    return campusDate(new Date(date.getTime() - 24 * 60 * 60_000));
  }
  return campusDate(date);
}

export function campusMinutesNow(date = new Date()) {
  const parts = campusClock.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function parseHm(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function formatHm(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isAllDay(openTime: string, closeTime: string) {
  return openTime === ALL_DAY_OPEN && closeTime === ALL_DAY_CLOSE;
}

// Late-night counters close after midnight, e.g. 18:00–02:00.
export function crossesMidnight(openTime: string, closeTime: string) {
  return !isAllDay(openTime, closeTime) && parseHm(closeTime) <= parseHm(openTime);
}

export function hoursLabel(openTime: string, closeTime: string) {
  return isAllDay(openTime, closeTime) ? "Open 24 hours" : `${openTime}–${closeTime}`;
}

export function isStallOpen(
  openTime: string,
  closeTime: string,
  date = new Date(),
) {
  if (isAllDay(openTime, closeTime)) return true;
  const now = campusMinutesNow(date);
  const open = parseHm(openTime);
  const close = parseHm(closeTime);
  if (crossesMidnight(openTime, closeTime)) return now >= open || now < close;
  return now >= open && now < close;
}

export function opensLaterToday(openTime: string, date = new Date()) {
  return campusMinutesNow(date) < parseHm(openTime);
}

export function busyCopy(level: string) {
  if (level === "busy") return "Busy";
  if (level === "quiet") return "Short wait";
  return "Moderate";
}
