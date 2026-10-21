export const CAMPUS_TIME_ZONE = "Asia/Kolkata";

const ALL_DAY_OPEN = "00:00";
const ALL_DAY_CLOSE = "23:59";

const campusClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: CAMPUS_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

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
  return now >= parseHm(openTime) && now < parseHm(closeTime);
}

export function opensLaterToday(openTime: string, date = new Date()) {
  return campusMinutesNow(date) < parseHm(openTime);
}

export function busyCopy(level: string) {
  if (level === "busy") return "Busy";
  if (level === "quiet") return "Short wait";
  return "Moderate";
}
