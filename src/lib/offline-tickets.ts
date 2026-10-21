// The page side of offline tickets (see public/sw.js, which serves them).
// Names must match the worker's.
const TICKETS = "iwf-tickets-v1";
const MAX_TICKETS = 10;
const OWNER_KEY = "iwf-device-owner";

let claimed: Promise<void> = Promise.resolve();

// Saved tickets belong to whoever was signed in. When someone else signs in
// on this browser, the previous person's copies go.
export function claimDevice(owner: string) {
  if (typeof window === "undefined" || !("caches" in window)) return;
  let previous: string | null = null;
  try {
    previous = localStorage.getItem(OWNER_KEY);
    localStorage.setItem(OWNER_KEY, owner);
  } catch {
    return;
  }
  if (previous && previous !== owner) claimed = caches.delete(TICKETS).then(() => undefined, () => undefined);
}

// Called by a ticket that has rendered. Fetches this page again and keeps it
// only if it really is that ticket (a "Not found" page streams as 200 too).
export async function keepTicket(orderId: string) {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    await claimed;
    const path = location.pathname;
    const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
    const html = await response.text();
    if (!response.ok || response.redirected || !html.includes(`data-ticket-id="${orderId}"`)) return;
    const cache = await caches.open(TICKETS);
    // Keep the page's headers (its CSP nonce matches the saved HTML), minus the
    // ones that described the original compressed body.
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");
    await cache.put(path, new Response(html, { headers }));
    const kept = await cache.keys();
    for (const old of kept.slice(0, Math.max(0, kept.length - MAX_TICKETS))) await cache.delete(old);
  } catch {
    // Offline already, or storage blocked: the ticket still shows while the page is open.
  }
}
