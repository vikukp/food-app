# HPE IWF Campus Food Court

HungerBox-style web app for the HPE IWF campus food court. Employees browse about 20 stalls, pick a pickup time, pay with a mock Pluxee / UPI / card checkout, and show a QR token at the counter. Stall staff see incoming orders and mark them ready.

This is a web-first slice. Phones work in the browser (Add to Home Screen / PWA). Native iOS and Play Store apps are not included yet.

**Works without a signal at the counter.** A service worker (`public/sw.js`, production only) keeps a copy of every ticket the employee opens (the last 10), so the token and QR still show if the phone drops off the network in the food court; other pages show a short offline notice listing the saved tickets. Signing out answers with `Clear-Site-Data`, which removes the saved tickets, the bag and the worker from a shared phone.

## Run locally

Needs Node.js 20.9 or newer and npm.

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

The first `dev` / `build` run generates Prisma Client, creates a local SQLite database, and seeds stalls.

### Demo mode

`DEMO_MODE=1` turns on the demo conveniences: sign-in codes shown on screen instead of texted, one shared counter PIN (`1234`, or `DEMO_VENDOR_PIN`) on the stall login page, and the seeded demo employee. `npm run dev` writes `DEMO_MODE=1` into `.env.local` the first time, unless `DEMO_MODE` is already set somewhere.

Demo mode is **off** unless set, so a production server that forgets a setting fails closed: codes are refused until an SMS provider is configured (PIN sign-in still works), and each new stall gets its own random counter PIN, printed once by the seed.

For a demo over a tunnel or port-forward, prefer the production server: it ships about a tenth of the JavaScript and has no dev-only HMR socket or cross-origin checks. Make sure `.env.local` has `DEMO_MODE=1` (running `npm run dev` once does this).

```bash
npm run build
npm start
```

`npm start` runs `server.mjs`, which is `next start` plus a trusted client address for rate limits (see Security). `PORT` and `HOST` override `43123` and `0.0.0.0`.

## Demo logins

With `DEMO_MODE=1`:

**Employee**

- Open **Continue as employee**
- Demo employee: mobile `98450 12345`, PIN `4826` (employee ID `HPE-48219`)
- Or sign in with a one-time code: in demo SMS mode no text is sent and the code appears on the verify screen. Any 10-digit Indian mobile number works; a new number goes on to registration.

**Stall counter**

- Open **Stall counter**
- Choose any stall
- PIN: `1234` (same PIN for every stall)

## Try the skip-the-line flow

1. Sign in as an employee and add items from one stall.
2. Checkout: choose a 15-minute pickup slot and a mock payment method.
3. Keep the QR / `IWF-xxxx` token screen open.
4. In another tab, sign in as that stall and tap **Start preparing**, then **Mark ready**.
5. The employee token screen flips to **Ready for pickup**: the phone vibrates and chimes, the tab title changes, and a notification appears if the employee tapped **Notify me when it is ready**.
6. At the counter, type the token's 4 digits into **Find token** (or tap **Scan QR** on a browser with a built-in QR reader, such as Chrome on Android) and tap **Mark collected**.

## Cancelling

- An employee can cancel from the token screen until the stall taps **Start preparing**.
- The stall can cancel until the order is ready, picking a reason the employee sees ("An item ran out", "Kitchen is closing", "Too busy to make it in time").
- Either way the mock payment shows as refunded and the order moves to the counter's **Done** tab.

## Counter screen

- **Today** shows orders, takings and cancellations for the campus day, and the top items.
- **Find token** filters every tab by the digits typed; **Find** looks up today's order with that token even if it has dropped off the list. A QR scan checks the ticket's signature and refuses tickets for other stalls.
- The queue refreshes every 3 seconds and costs almost nothing when nothing has changed (the server answers 304).
- Two tablets can run the same stall: a tap made on a stale screen is refused instead of skipping a step.
- **Download CSV** at the bottom exports a trading day's orders (token, times, status, employee, items with prices, payment, total, cancel reason) for the stall's accounts. Text that a spreadsheet would run as a formula is defused.

## Employee sign-in

- **First visit:** enter a mobile number, then the 6-digit code sent by SMS. A number that is not registered yet goes on to a short form: name on the badge, employee ID, and a 4–6 digit PIN.
- **Returning:** sign in with a one-time code, or with mobile number (or employee ID) and PIN.
- **Forgot PIN / change PIN:** **Forgot PIN?** on the PIN tab, or **Change PIN** on the orders page. Both send a code to the registered number before a new PIN can be set. Saving a new PIN signs out every other device.
- Codes last 5 minutes and allow 5 tries. A new code replaces the previous one. Each number can get one code every 30 seconds and 5 an hour.
- Easy PINs (repeats like `1111`, runs like `1234`, common picks, the end of the mobile number) are refused. Five wrong PINs within 30 minutes lock PIN sign-in for the rest of that window, or until the employee signs in with a code. The third lockout without a successful sign-in in between does not run out: only a code sign-in lifts it.

### SMS provider

`SMS_PROVIDER` picks how codes are delivered:

| Value | Behaviour |
| --- | --- |
| unset or `demo` | With `DEMO_MODE=1`: no SMS; the code is shown on the verify screen and logged to the server console. Anyone can sign in as any number, so use this only for demos. Without `DEMO_MODE=1`: codes are refused and the sign-in page offers PIN sign-in only. |
| `twilio` | Sends through Twilio's Messages API. Needs `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM` or `TWILIO_MESSAGING_SERVICE_SID`. `TWILIO_API_BASE` overrides the API host (regional edge or a test stub). |

Any other value, missing Twilio credentials, an HTTP error or a 10-second timeout fails closed: no code is issued and the employee is asked to try again or use their PIN. `OTP_DAILY_LIMIT` (default 2000) caps texts per rolling 24 hours across the whole app.

SMS to Indian numbers requires a DLT-registered sender ID and message template. The message is: `123456 is your HPE IWF Food Court sign-in code. Valid for 5 minutes. Do not share it with anyone.`

## Vendor catalogue

Signed-in stall staff get a **Menu** link in the header (`/vendor/menu`) where they can:

- add items (name, description, category, price, veg flag) that go live immediately;
- edit price and details;
- set an offer price and label (employees see the offer price, the struck-through regular price and a `Lunch combo · −18%` style tag; orders are charged at the offer price, computed on the server);
- mark an item **sold out** (stays visible, no Add button) or **hide** it from the menu entirely (past orders keep their line items);
- change the stall's counter PIN (this signs out every other tablet signed in to the stall).

Reseeding never overwrites vendor edits; it only adds stalls or items that are missing.

## Food court admin

Employees whose mobile number is listed in `ADMIN_PHONES` (comma-separated, e.g. `98450 12345, +91 98450 67890`) get a **Food court admin** link on their orders page (`/admin`). Admins are listed by phone because the phone is what sign-in proves; employee IDs are typed in at registration and are not checked. In demo mode with none listed, the demo employee is the admin. Everyone else gets "Not found" there.

- Every stall at a glance: open, closed or paused; today's orders, takings, cancellations and how many are waiting.
- Pause or resume any stall.
- **Reset counter PIN** for a stall that forgot it: a new random 6-digit PIN is shown once, and every tablet signed in to the stall is signed out. This needs a code sign-in in the last 10 minutes. Resets and pauses are logged to the server console with the admin's employee ID.

## Hours

Stall hours are campus time (IST). Most stalls serve lunch through the evening, a few (Idli & Filter Coffee, Sandwich & Wrap Lab, Maggi & Momos) run 24x7, and the biryani / meals counters are lunch-only. Pickup slots are 15-minute windows from about 10 minutes out until the stall closes, so the demo works at any hour. Hours may cross midnight (e.g. `18:00`–`02:00`): the stall is open on both sides of midnight and takes slots up to closing.

## Deploying

A checklist for running this for real, on one server:

1. **Node 20.9+**, then `npm ci && npm run build`. Run `npm start` under a process manager (systemd, pm2) or a container. It listens on `0.0.0.0:43123` (`HOST`, `PORT`).
2. **Secrets and mode.** Set `SESSION_SECRET` (32+ random characters) in the environment or `.env.production`. Do **not** set `DEMO_MODE`.
3. **SMS.** `SMS_PROVIDER=twilio` with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` or `TWILIO_MESSAGING_SERVICE_SID`. Indian numbers need a DLT-registered sender and template (see SMS provider above). Without SMS, employees can only use PINs and new employees cannot register.
4. **TLS and proxy.** Put the app behind a reverse proxy (nginx, Caddy, a cloud load balancer) that terminates HTTPS and sets `X-Forwarded-For` and `X-Forwarded-Proto`, then set `TRUST_PROXY_HOPS=1` (in the environment or `.env.production`). Session cookies become `Secure` and HSTS turns on automatically over HTTPS. Make sure browsers can only reach the app through the proxy: with the proxy on the same machine set `HOST=127.0.0.1`, otherwise firewall port 43123, or a client connecting directly could choose its own address.
5. **Stall PINs.** The first build on an empty database prints a random PIN per stall. Hand each to its stall; they can change it under **Menu**. If the database was created in demo mode, the build warns about every stall still on the demo PIN.
6. **Admins.** Set `ADMIN_PHONES` to the food court managers' mobile numbers.
7. **Data.** SQLite lives in `prisma/dev.db`; back it up (e.g. `sqlite3 prisma/dev.db ".backup backup.db"`) and keep it on persistent disk. `npm run build` applies schema changes with `prisma db push` and never removes vendor edits.
8. **Before employees use it:** connect registration to the HR directory or HPE SSO (names and IDs are not checked today), and replace the mock payment with the real Pluxee / UPI gateway.

Rate limits and the code-request queue are kept in process memory, so run one instance. To scale out, move them to Redis and the database to Postgres.

## Security

- Employee and vendor sessions are HMAC-signed, expiring cookies (`HttpOnly`, `SameSite=Lax`, `Secure` when served over TLS). The proxy verifies the signature before any protected route renders; a forged or edited cookie is dropped and redirected to sign-in.
- An employee session names a database row and a session version. Every request checks both, so resetting a PIN logs out other devices. Changing a PIN needs a code sign-in from the last 10 minutes.
- One-time codes are stored only as an HMAC, are single use, and are limited per number, per network and per day. Only Indian mobile numbers are accepted, which keeps the SMS bill away from international premium-rate numbers.
- Employee PINs are scrypt hashes. PIN sign-in gives the same answer and the same lockout for unknown numbers as for real ones, so it cannot be used to find out who is registered.
- The signing key is `SESSION_SECRET`. `npm run dev|build|start` generate a random one into `.env.local` if none is set; set it explicitly in production and rotate it to log everyone out.
- Vendor sessions carry the stall's session version, so changing the counter PIN signs out every other tablet.
- Vendor PINs are stored as scrypt hashes and compared in constant time. Five wrong PINs lock a stall's login for 15 minutes; sign-in and order placement are also rate-limited per client.
- QR payloads carry an HMAC so a counter scanner can reject fabricated codes (`src/lib/qr.ts`).
- Every response carries a nonce-based Content-Security-Policy, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and HSTS behind TLS. `X-Powered-By` is off.
- All order input is validated server-side and prices are always taken from the stall's catalogue, never from the client.
- The phone number is verified, but the name and employee ID typed at registration are not checked against HR. Before real use, connect registration to the HR directory or HPE SSO. If the database was ever seeded in demo mode, delete the demo employee and change every stall PIN (the seed warns about the former).
- Per-network limits key on the client address. `server.mjs` works it out from the socket and `X-Forwarded-For`, trusting only `TRUST_PROXY_HOPS` proxies (default `0`: browsers connect directly and any `X-Forwarded-For` they send is ignored). Behind one reverse proxy or load balancer, set `TRUST_PROXY_HOPS=1`. `next dev` passes the header through as sent, so this only holds for `npm start`. In-process rate limits are fine for one server; move them to Redis if you scale out.

## Tests

```bash
npm run lint
npm run typecheck
npm test            # unit tests (node:test): hours and pickup slots, pricing, tokens, PINs, phones, QR, client address
```

GitHub Actions (`.github/workflows/ci.yml`) runs all of these plus a production build and the browser suite on every pull request and push to `main`.

With the app running in demo mode (`DEMO_MODE=1`, then `npm run build && npm start`), run the browser suite in another terminal:

```bash
npm run test:e2e
```

It uses your installed Google Chrome (set `CHROME_PATH` for another Chromium binary, `BASE_URL` for another server, `SCREENSHOT_DIR` to keep screenshots). It covers registration, code and PIN sign-in, lockout and unlock, resend cooldown and forgot PIN; places an order and takes it through the counter queue to collected (found by token); checks that a stale second tablet cannot skip a step, that changing the counter PIN signs out other tablets, that employees and stalls can cancel; and runs an axe accessibility audit (WCAG 2.1 AA) over every page. Each run registers new random numbers and never touches the demo employee. The suite takes about 75 seconds because it waits out the 30-second resend cooldown. Running it more than once in 15 minutes from one machine trips the PIN sign-in rate limit; restart the server to reset it.

## Stack

Next.js (App Router), TypeScript, Tailwind, shadcn/ui, Prisma + SQLite.

Payments are mocked. There is no HPE SSO and no live Pluxee or UPI gateway; SMS needs a provider, or `DEMO_MODE=1` for on-screen codes.
