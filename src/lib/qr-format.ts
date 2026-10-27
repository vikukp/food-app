// The text inside a pickup QR: FOOD-COURT|T-4821|<order id>|<signature>.
// lib/qr.ts makes and checks it on the server, where the signing key is; this
// only knows its shape, so the counter can tell a ticket apart when a scanner
// gun types it in. Safe to use in the browser.
export const QR_PREFIX = "FOOD-COURT";
export const QR_SIG_CHARS = 24;

const TICKET_TEXT = new RegExp(`${QR_PREFIX}\\|T-\\d{4}\\|[a-z0-9]{10,40}\\|[0-9a-f]{${QR_SIG_CHARS}}$`, "i");

// A whole ticket's text at the end of what was typed (a gun types after
// whatever is already in the box), or null.
export function ticketTextIn(typed: string) {
  return typed.trim().match(TICKET_TEXT)?.[0] ?? null;
}
