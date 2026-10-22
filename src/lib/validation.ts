export const NAME_PATTERN = /^[\p{L}][\p{L} .'\-]{1,59}$/u;
export const EMPLOYEE_ID_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,19}$/;
export const PIN_PATTERN = /^\d{4,8}$/;
export const EMPLOYEE_PIN_PATTERN = /^\d{4,6}$/;
export const OTP_CODE_PATTERN = /^\d{6}$/;
export const STALL_ID_PATTERN = /^[a-z0-9-]{2,40}$/;
export const ITEM_ID_PATTERN = /^[a-z0-9-]{2,80}$/i;
export const SLOT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Per stall's order. A bag can mix stalls; each becomes its own order.
export const MAX_LINES_PER_ORDER = 15;
export const MAX_QTY_PER_LINE = 20;
export const MAX_ITEMS_PER_ORDER = 30;
// More counters than one person can walk to within a pickup slot.
export const MAX_STALLS_PER_BAG = 4;

export function cleanText(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);
}

export function toInt(value: unknown) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isInteger(n) ? n : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
