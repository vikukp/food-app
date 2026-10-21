// Keeps order tickets on screen without a signal: the food court is often in
// a basement where the phone drops off the network right at the counter.
//
// - A ticket page saves a copy of itself once it has rendered (see
//   src/lib/offline-tickets.ts; app navigation never reaches this worker as a
//   page load). Online, pages always come from the network; offline, a saved
//   ticket is shown.
// - Built JS/CSS (/_next/static, content-hashed) is kept so that copy works.
// - Any other page offline gets a short "you're offline" page listing kept tickets.
// - Signing out answers with Clear-Site-Data, which drops all of this.
const TICKETS = "iwf-tickets-v1";
const ASSETS = "iwf-assets-v1";
const MAX_ASSETS = 300;
const TICKET_PATH = /^\/orders\/[a-z0-9]{10,40}$/i;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== TICKETS && name !== ASSETS) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

async function offlinePage() {
  const kept = await (await caches.open(TICKETS)).keys();
  const links = kept
    .map((request) => new URL(request.url).pathname)
    .reverse()
    .map((path) => `<li><a href="${path}">Ticket ${path.split("/").pop().slice(-6)}</a></li>`)
    .join("");
  const body = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · IWF Food Court</title>
<body style="font-family:system-ui,sans-serif;background:#f4f1ea;color:#1c1917;margin:0;padding:24px;max-width:28rem">
<h1 style="font-size:1.4rem">You are offline</h1>
<p>Ordering needs a connection. Tickets you opened on this phone still work at the counter:</p>
<ul>${links || "<li>No saved tickets yet.</li>"}</ul></body>`;
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSETS);
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response.clone());
          // Old builds' files pile up otherwise; the oldest go first.
          const kept = await cache.keys();
          for (const old of kept.slice(0, Math.max(0, kept.length - MAX_ASSETS))) await cache.delete(old);
        }
        return response;
      })(),
    );
    return;
  }

  if (request.mode !== "navigate") return;

  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        if (TICKET_PATH.test(url.pathname)) {
          const kept = await (await caches.open(TICKETS)).match(url.pathname);
          if (kept) return kept;
        }
        return offlinePage();
      }
    })(),
  );
});
