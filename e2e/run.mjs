// Browser checks against a running server in demo mode (DEMO_MODE=1):
//   npm run build && npm start      (in one terminal)
//   npm run test:e2e                (in another)
// BASE_URL, CHROME_PATH and SCREENSHOT_DIR are optional. Every run registers
// fresh random mobile numbers and never touches the demo employee.
import { randomInt } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:43123").replace(/\/+$/, "");
const VENDOR_PIN = process.env.DEMO_VENDOR_PIN ?? "1234";
const SHOTS = process.env.SCREENSHOT_DIR;
const RESEND_WAIT_MS = 31_000;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const results = [];
const pageErrors = [];
const lastCodeAt = new Map();
const openPages = new Set();

async function step(name, run) {
  const started = Date.now();
  try {
    const note = await run();
    results.push(true);
    console.log(`PASS  ${name}${note ? ` — ${note}` : ""} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  } catch (error) {
    results.push(false);
    console.log(`FAIL  ${name} — ${String(error?.message ?? error).split("\n")[0].slice(0, 300)}`);
    for (const page of openPages) {
      if (page.isClosed()) continue;
      console.log(`      [${page.label}] at ${page.url()}`);
      await snap(page, `fail-${results.length}-${page.label}`).catch(() => {});
    }
  }
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function randomPhone() {
  return `7${String(randomInt(0, 1e9)).padStart(9, "0")}`;
}

function spaced(phone) {
  return `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
}

function masked(phone) {
  return `+91 ${phone.slice(0, 2)}••• ••${phone.slice(7)}`;
}

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" },
);

async function newPage(label, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.label = label;
  openPages.add(page);
  page.on("close", () => openPages.delete(page));
  page.on("pageerror", (error) => pageErrors.push(`[${label}] ${error.message.slice(0, 200)}`));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(`[${label}] ${message.text().slice(0, 200)}`);
  });
  return page;
}

async function snap(page, name) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function alertText(page) {
  const alert = page.locator("main [role='alert']").first();
  await alert.waitFor({ timeout: 5000 });
  return (await alert.innerText()).trim();
}

async function inboxCode(page) {
  const message = page.getByText(/is your HPE IWF Food Court sign-in code/);
  await message.waitFor({ timeout: 5000 });
  return (await message.innerText()).match(/(\d{6}) is your/)[1];
}

// The server allows one code per number every 30 seconds.
async function requestCode(page, phone, path = "/enter") {
  const last = lastCodeAt.get(phone);
  if (last) await sleep(Math.max(0, last + RESEND_WAIT_MS - Date.now()));
  await page.goto(`${BASE}${path}`);
  await page.fill("#phone", phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.waitForURL(`${BASE}/enter/verify`);
  lastCodeAt.set(phone, Date.now());
  return inboxCode(page);
}

async function submitCode(page, code) {
  if (page.url() !== `${BASE}/enter/verify`) await page.goto(`${BASE}/enter/verify`);
  await page.locator("#code").waitFor();
  await page.fill("#code", code);
  await page.getByRole("button", { name: "Verify and continue" }).click();
}

// Start from the bare URL: a refusal redirects to ?error=…, and a second
// refusal with the same code would not change the URL to wait on.
async function submitRegistration(page, { name, employeeId, pin, confirm = pin }) {
  if (page.url() !== `${BASE}/enter/register`) await page.goto(`${BASE}/enter/register`);
  await page.fill("#name", name);
  await page.fill("#employeeId", employeeId);
  await page.fill("#pin", pin);
  await page.fill("#confirmPin", confirm);
  await page.getByRole("button", { name: "Create account" }).click();
}

async function pinSignIn(page, identifier, pin) {
  await page.goto(`${BASE}/enter?method=pin`);
  await page.fill("#identifier", identifier);
  await page.fill("#pin", pin);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function signOut(page) {
  await page.locator("header").getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(`${BASE}/`);
}

let pin = "5172";
const nextPin = "6391";
let phone = randomPhone();
while (phone.endsWith(pin) || phone.endsWith(nextPin)) phone = randomPhone();
const user = {
  phone,
  name: "Asha Verma",
  employeeId: `QA-${randomInt(0, 36 ** 6).toString(36).toUpperCase().padStart(6, "0")}`,
};

const emp = await newPage("employee");

await step("sign-in page offers a one-time code or a PIN", async () => {
  await emp.goto(`${BASE}/`);
  await emp.getByRole("link", { name: "Continue as employee" }).click();
  await emp.waitForURL(`${BASE}/enter`);
  const methods = emp.getByRole("navigation", { name: "Sign-in method" });
  check(
    (await methods.getByRole("link", { name: "One-time code" }).getAttribute("aria-current")) === "page",
    "one-time code is not the default method",
  );
  check((await methods.getByRole("link", { name: "PIN" }).count()) === 1, "PIN method missing");
  check((await emp.getByText("Demo SMS mode").count()) === 1, "demo SMS banner missing (is SMS_PROVIDER unset?)");
  await snap(emp, "01-sign-in-code");
  await emp.getByRole("link", { name: "PIN" }).click();
  await emp.waitForURL(`${BASE}/enter?method=pin`);
  await snap(emp, "02-sign-in-pin");
});

await step("pages behind sign-in send you back to it", async () => {
  const guest = await newPage("guest");
  await guest.goto(`${BASE}/stalls`);
  await guest.waitForURL(`${BASE}/enter`);
  await guest.goto(`${BASE}/enter/verify`);
  await guest.waitForURL(`${BASE}/enter?error=expired`);
  await guest.goto(`${BASE}/enter/register`);
  await guest.waitForURL(`${BASE}/enter?error=regexpired`);
  check((await alertText(guest)).includes("verification timed out"), "no message for a missing registration");
  await guest.goto(`${BASE}/enter/new-pin`);
  await guest.waitForURL(`${BASE}/enter?reset=1&error=reauth`);
  return "/stalls, /enter/verify, /enter/register and /enter/new-pin all redirect";
});

await step("a number that is not an Indian mobile is refused", async () => {
  await emp.goto(`${BASE}/enter`);
  await emp.fill("#phone", "1234567890");
  await emp.getByRole("button", { name: "Send code" }).click();
  await emp.waitForURL(/error=phone/);
  const text = await alertText(emp);
  check(text.includes("10-digit Indian mobile number"), `unexpected message: ${text}`);
  check((await emp.inputValue("#phone")) === "1234567890", "typed number was replaced after the refusal");
});

await step("a new number gets a code (demo inbox shows it)", async () => {
  user.code = await requestCode(emp, user.phone);
  const main = await emp.locator("main").innerText();
  check(main.includes(masked(user.phone)), "masked number not shown");
  check(!main.includes(user.phone), "full number shown on the verify page");
  await snap(emp, "03-verify-code");
  return `code ${user.code} for ${masked(user.phone)}`;
});

await step("a wrong code is refused and the tries count down", async () => {
  const wrong = String((Number(user.code) + 1) % 1_000_000).padStart(6, "0");
  await submitCode(emp, wrong);
  await emp.waitForURL(/error=wrong/);
  check((await alertText(emp)).includes("That code is not right"), "no wrong-code message");
  check((await emp.locator("main").innerText()).includes("4 tries left"), "tries left not shown");
});

await step("the right code opens registration with the verified number", async () => {
  await submitCode(emp, user.code);
  await emp.waitForURL(`${BASE}/enter/register`);
  check((await emp.inputValue("#username")) === spaced(user.phone), "verified number not shown");
  check((await emp.context().cookies()).every((c) => c.name !== "iwf_otp"), "code ticket cookie left behind");
});

await step("weak PINs are refused and typed details are kept", async () => {
  await submitRegistration(emp, { name: user.name, employeeId: user.employeeId.toLowerCase(), pin: "1234" });
  await emp.waitForURL(/error=pinweak/);
  check((await alertText(emp)).includes("too easy to guess"), "no weak-PIN message");
  check((await emp.inputValue("#name")) === user.name, "name was not kept");
  check((await emp.inputValue("#employeeId")) === user.employeeId, "employee ID was not kept (or not upper-cased)");
  check((await emp.inputValue("#pin")) === "", "PIN was echoed back");
  await snap(emp, "04-register-weak-pin");
});

await step("a PIN matching the end of the number, and mismatched PINs, are refused", async () => {
  await submitRegistration(emp, { name: user.name, employeeId: user.employeeId, pin: user.phone.slice(-4) });
  await emp.waitForURL(/error=pinweak/);
  await submitRegistration(emp, { name: user.name, employeeId: user.employeeId, pin, confirm: "5173" });
  await emp.waitForURL(/error=pinmatch/);
  check((await alertText(emp)).includes("do not match"), "no mismatch message");
});

await step("an employee ID registered to another number is refused", async () => {
  await submitRegistration(emp, { name: user.name, employeeId: "HPE-48219", pin });
  await emp.waitForURL(/error=idtaken/);
  check((await alertText(emp)).includes("already registered"), "no duplicate-ID message");
});

await step("registration signs you in", async () => {
  await submitRegistration(emp, { name: user.name, employeeId: user.employeeId, pin });
  await emp.waitForURL(`${BASE}/stalls`);
  check((await emp.locator("header").innerText()).includes(user.name), "name missing from the header");
  const cookies = await emp.context().cookies();
  const session = cookies.find((c) => c.name === "iwf_employee");
  check(session?.httpOnly && session.sameSite === "Lax", "session cookie is not HttpOnly + SameSite=Lax");
  check(cookies.every((c) => c.name !== "iwf_reg"), "registration ticket cookie left behind");
  return `${user.name} · ${user.employeeId}`;
});

await step("orders page shows the account and a Change PIN link", async () => {
  await emp.goto(`${BASE}/orders`);
  // Wait for the streamed page to be revealed: until then it sits in a hidden
  // container whose text innerText still reads but role queries skip.
  const changePin = emp.getByRole("link", { name: "Change PIN" });
  await changePin.waitFor({ timeout: 5000 }).catch(() => {});
  const main = await emp.locator("main").innerText();
  check(main.includes(user.employeeId) && main.includes(masked(user.phone)), "account line missing");
  check((await changePin.count()) === 1, "Change PIN link missing");
});

await step("sign out, then sign in with mobile number and PIN", async () => {
  await signOut(emp);
  await pinSignIn(emp, spaced(user.phone), pin);
  await emp.waitForURL(`${BASE}/stalls`);
});

await step("sign in with employee ID (any case) and PIN", async () => {
  await signOut(emp);
  await pinSignIn(emp, user.employeeId.toLowerCase(), pin);
  await emp.waitForURL(`${BASE}/stalls`);
});

await step("an unknown number gets the same answer as a wrong PIN", async () => {
  await signOut(emp);
  await pinSignIn(emp, randomPhone(), pin);
  await emp.waitForURL(/error=credentials/);
  const unknown = await alertText(emp);
  await pinSignIn(emp, user.phone, "8642");
  await emp.waitForURL(/error=credentials/);
  const wrong = await alertText(emp);
  check(unknown === wrong, `messages differ: "${unknown}" vs "${wrong}"`);
  return `"${wrong}"`;
});

await step("five wrong PINs in a row lock PIN sign-in", async () => {
  await pinSignIn(emp, user.phone, pin);
  await emp.waitForURL(`${BASE}/stalls`);
  await signOut(emp);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await pinSignIn(emp, user.phone, "8642");
    await emp.waitForURL(attempt < 5 ? /error=credentials/ : /error=locked/);
  }
  await pinSignIn(emp, user.phone, pin);
  await emp.waitForURL(/error=locked/);
  check((await alertText(emp)).includes("Sign in with a one-time code"), "lock message does not explain unlocking");
  check((await emp.inputValue("#identifier")) === user.phone, "typed number was replaced after the refusal");
  check((await emp.inputValue("#pin")) === "", "PIN was echoed back");
  await snap(emp, "05-pin-locked");
  return "even the right PIN is refused while locked";
});

await step("a code sign-in lifts the PIN lock", async () => {
  const code = await requestCode(emp, user.phone);
  await submitCode(emp, code);
  await emp.waitForURL(`${BASE}/stalls`);
  await signOut(emp);
  await pinSignIn(emp, user.phone, pin);
  await emp.waitForURL(`${BASE}/stalls`);
});

await step("changing a PIN needs a fresh code, not just a PIN session", async () => {
  await emp.goto(`${BASE}/enter/new-pin`);
  await emp.waitForURL(`${BASE}/enter?reset=1&error=reauth`);
  check((await alertText(emp)).includes("fresh code"), "no re-verification message");
  check((await emp.inputValue("#phone")) === user.phone, "own number not pre-filled for the reset");
});

await step("five wrong codes use the code up", async () => {
  const page = await newPage("exhaust");
  const target = randomPhone();
  const code = await requestCode(page, target);
  const wrong = String((Number(code) + 7) % 1_000_000).padStart(6, "0");
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await submitCode(page, wrong);
    await page.waitForURL(attempt < 5 ? /error=wrong/ : /error=exhausted/);
  }
  const main = await page.locator("main").innerText();
  check(main.includes("Too many wrong codes"), "no exhausted message");
  check((await page.locator("#code").count()) === 0, "code field still offered");
  check(!main.includes(code), "used-up code still shown in the demo inbox");
  await page.context().close();
});

await step("resend waits 30 seconds, then replaces the code", async () => {
  const page = await newPage("resend");
  const target = randomPhone();
  const first = await requestCode(page, target);
  const resend = page.getByRole("button", { name: /Resend code/ });
  check(await resend.isDisabled(), "resend is enabled straight away");
  check(/Resend code in \d+s/.test(await resend.innerText()), "no countdown on the resend button");
  await page.getByRole("button", { name: "Resend code", exact: true }).waitFor({ timeout: 40_000 });
  await page.getByRole("button", { name: "Resend code", exact: true }).click();
  await page.waitForURL(`${BASE}/enter/verify?sent=1`);
  lastCodeAt.set(target, Date.now());
  const second = await inboxCode(page);
  check((await page.locator("main [role='status']").innerText()).includes("New code sent"), "no resend notice");
  if (first !== second) {
    await submitCode(page, first);
    await page.waitForURL(/error=wrong/);
  }
  await submitCode(page, second);
  await page.waitForURL(`${BASE}/enter/register`);
  await page.context().close();
  return first === second ? "codes matched by chance" : "old code refused, new code accepted";
});

await step("forgot PIN: a code sets a new PIN and signs out other devices", async () => {
  const other = await newPage("other-device");
  await pinSignIn(other, user.phone, pin);
  await other.waitForURL(`${BASE}/stalls`);

  const code = await requestCode(emp, user.phone, "/enter?reset=1");
  await submitCode(emp, code);
  await emp.waitForURL(`${BASE}/enter/new-pin`);
  await emp.fill("#pin", "1111");
  await emp.fill("#confirmPin", "1111");
  await emp.getByRole("button", { name: "Save PIN" }).click();
  await emp.waitForURL(/error=pinweak/);
  await emp.fill("#pin", nextPin);
  await emp.fill("#confirmPin", nextPin);
  await emp.getByRole("button", { name: "Save PIN" }).click();
  await emp.waitForURL(`${BASE}/enter/new-pin?saved=1`);
  check((await emp.locator("main h1").innerText()).includes("PIN updated"), "no confirmation");
  await snap(emp, "06-pin-updated");

  await other.goto(`${BASE}/stalls`);
  await other.waitForURL(`${BASE}/enter`);
  await emp.goto(`${BASE}/stalls`);
  check(emp.url() === `${BASE}/stalls`, "this device was signed out too");

  const fresh = await newPage("pin-check");
  await pinSignIn(fresh, user.phone, pin);
  await fresh.waitForURL(/error=credentials/);
  await pinSignIn(fresh, user.phone, nextPin);
  await fresh.waitForURL(`${BASE}/stalls`);
  pin = nextPin;
  await other.context().close();
  await fresh.context().close();
  return "other device signed out; old PIN refused; new PIN works";
});

let token = "";
await step("order from a stall and get a QR token", async () => {
  await emp.goto(`${BASE}/stalls/momos`, { waitUntil: "networkidle" });
  await emp.locator("main button:has-text('Add')").first().click();
  await emp.locator("header button:has-text('Bag')").click();
  await emp.locator("[data-slot='sheet-content'] a:has-text('Choose pickup time')").click();
  await emp.waitForURL(`${BASE}/checkout`);
  await emp.waitForFunction(() => /Pay ₹/.test(document.querySelector("main")?.innerText ?? ""));
  await emp.locator("main button:has-text('Pay ₹')").click();
  await emp.waitForURL(/\/orders\/[^/]+$/);
  token = (await emp.locator("main").innerText()).match(/IWF-\d{4}/)?.[0] ?? "";
  check(token && (await emp.locator("main img[alt*='QR']").count()) === 1, "token or QR missing");
  return token;
});

async function vendorSignIn(label, stallId = "momos", vendorPin = VENDOR_PIN) {
  const vendor = await newPage(label);
  await vendor.goto(`${BASE}/vendor/login`);
  await vendor.selectOption("select[name='stallId']", stallId);
  await vendor.fill("input[name='pin']", vendorPin);
  await vendor.getByRole("button", { name: "Open kitchen queue" }).click();
  await vendor.waitForURL(`${BASE}/vendor`);
  return vendor;
}

await step("vendor queue sees the order and the ticket updates live", async () => {
  const vendor = await vendorSignIn("vendor");
  const card = vendor.locator("main li", { hasText: token });
  await card.waitFor({ timeout: 8000 });
  check((await card.innerText()).includes(user.name), "order card does not show the registered name");
  await card.getByRole("button", { name: "Start preparing" }).click();
  await card.getByRole("button", { name: "Mark ready" }).waitFor();

  // A second counter tablet whose queue stopped refreshing still shows "Mark ready".
  const stale = await vendorSignIn("vendor-stale");
  const staleCard = stale.locator("main li", { hasText: token });
  await staleCard.getByRole("button", { name: "Mark ready" }).waitFor({ timeout: 8000 });
  // Leave its refreshes hanging (an abort would log console errors).
  await stale.route("**/api/vendor/orders", () => {});

  await card.getByRole("button", { name: "Mark ready" }).click();
  await emp.waitForFunction(
    () => document.querySelector("main")?.innerText.includes("Ready for pickup"),
    null,
    { timeout: 12_000 },
  );

  await staleCard.getByRole("button", { name: "Mark ready" }).click();
  await stale.getByText("updated on another screen").waitFor({ timeout: 5000 });
  await sleep(3500);
  check(
    (await emp.locator("main").innerText()).includes("Ready for pickup"),
    "a stale tablet moved the order past Ready",
  );
  await stale.context().close();
  await vendor.context().close();
  return `${token} for ${user.name} flipped to "Ready for pickup"; stale tablet refused`;
});

await step("changing the counter PIN signs out other tablets", async () => {
  const owner = await vendorSignIn("vendor-owner");
  const other = await vendorSignIn("vendor-other");
  const changePin = async (from, to) => {
    await owner.goto(`${BASE}/vendor/menu`);
    await owner.fill("#currentPin", from);
    await owner.fill("#newPin", to);
    await owner.fill("#confirmPin", to);
    await owner.getByRole("button", { name: "Change PIN" }).click();
    await owner.waitForURL(/[?&]ok=pin/);
  };
  const tempPin = "583016";
  await changePin(VENDOR_PIN, tempPin);
  try {
    await other.goto(`${BASE}/vendor`);
    await other.waitForURL(`${BASE}/vendor/login`);
    await owner.goto(`${BASE}/vendor`);
    check(owner.url() === `${BASE}/vendor`, "the tablet that changed the PIN was signed out");
  } finally {
    await changePin(tempPin, VENDOR_PIN);
  }
  await other.context().close();
  await owner.context().close();
});

async function placeMomosOrder(page) {
  await page.goto(`${BASE}/stalls/momos`, { waitUntil: "networkidle" });
  await page.locator("main button:has-text('Add')").first().click();
  await page.goto(`${BASE}/checkout`);
  await page.waitForFunction(() => /Pay ₹/.test(document.querySelector("main")?.innerText ?? ""));
  await page.locator("main button:has-text('Pay ₹')").click();
  await page.waitForURL(/\/orders\/[^/]+$/);
  return (await page.locator("main").innerText()).match(/IWF-\d{4}/)?.[0] ?? "";
}

await step("an employee can cancel before the kitchen starts", async () => {
  const cancelToken = await placeMomosOrder(emp);
  emp.once("dialog", (dialog) => dialog.accept());
  await emp.getByRole("button", { name: "Cancel order" }).click();
  await emp.getByText("You cancelled this order.").waitFor({ timeout: 8000 });
  check((await emp.locator("main img[alt*='QR']").count()) === 0, "QR still shown on a cancelled ticket");
  await emp.reload();
  await emp.getByText("You cancelled this order.").waitFor({ timeout: 8000 });
  return `${cancelToken} cancelled`;
});

await step("the stall can cancel with a reason and the ticket says why", async () => {
  const cancelToken = await placeMomosOrder(emp);
  const vendor = await vendorSignIn("vendor-cancel");
  const card = vendor.locator("main li", { hasText: cancelToken });
  await card.getByRole("button", { name: "Cancel" }).click();
  await card.getByRole("button", { name: "An item ran out" }).click();
  await vendor.getByText(`${cancelToken} cancelled`).waitFor({ timeout: 5000 });
  await emp.getByText("The stall cancelled this order: an item ran out.").waitFor({ timeout: 12_000 });
  await vendor.getByRole("button", { name: "done" }).click();
  check((await vendor.locator("main li", { hasText: cancelToken }).innerText()).includes("An item ran out"), "reason missing on the done tab");
  await vendor.context().close();
  return `${cancelToken} cancelled by the stall`;
});

await step("the counter finds a token, hands it over, and other stalls cannot", async () => {
  const digits = token.replace("IWF-", "");
  const other = await vendorSignIn("vendor-dosa", "dosa");
  await other.getByLabel("Find token").fill(digits);
  await other.getByRole("button", { name: "Find" }).click();
  await other.getByText("No order with that token at this stall today.").waitFor({ timeout: 5000 });
  await other.context().close();

  const vendor = await vendorSignIn("vendor-find");
  const summary = await vendor.getByRole("region", { name: "Today" }).innerText();
  check(/\b[1-9]\d*\s+orders today/.test(summary), `summary shows no orders: ${summary.replace(/\s+/g, " ")}`);
  await vendor.getByLabel("Find token").fill(digits);
  await vendor.getByRole("button", { name: "Find" }).click();
  const card = vendor.locator("main li", { hasText: token });
  await card.getByRole("button", { name: "Mark collected" }).click();
  await vendor.getByText("Collected", { exact: true }).first().waitFor({ timeout: 5000 });
  await vendor.context().close();

  const ticket = await newPage("ticket-check");
  await ticket.context().addCookies(await emp.context().cookies());
  await ticket.goto(`${BASE}/orders`);
  await ticket.locator("main li", { hasText: token }).getByText("Collected").waitFor({ timeout: 8000 });
  await ticket.context().close();
  return `${token} found by token and collected; another stall was refused`;
});

await step("order again refills the bag from a past order", async () => {
  await emp.goto(`${BASE}/orders`);
  await emp.locator("main a", { hasText: token }).click();
  await emp.waitForURL(/\/orders\/[^/]+$/);
  await emp.getByRole("button", { name: "Order again" }).click();
  await emp.waitForURL(`${BASE}/checkout`);
  await emp.waitForFunction(() => /Pay ₹/.test(document.querySelector("main")?.innerText ?? ""));
  return "bag refilled, checkout ready";
});

await step("a stall can pause new orders, and set its hours", async () => {
  const vendor = await vendorSignIn("vendor-pause");
  await vendor.goto(`${BASE}/vendor/menu`);
  await vendor.getByRole("button", { name: "Pause new orders" }).click();
  await vendor.waitForURL(/ok=paused/);
  try {
    await emp.goto(`${BASE}/stalls/momos`);
    await emp.getByText("This stall has paused new orders").waitFor({ timeout: 5000 });
    await emp.goto(`${BASE}/checkout`);
    await emp.getByText("paused new orders").waitFor({ timeout: 5000 });
    check((await emp.locator("main button:has-text('Pay ₹')").count()) === 0, "checkout still offers Pay while paused");
  } finally {
    await vendor.goto(`${BASE}/vendor/menu`);
    await vendor.getByRole("button", { name: "Resume orders" }).click();
    await vendor.waitForURL(/ok=resumed/);
  }
  await emp.goto(`${BASE}/checkout`);
  await emp.waitForFunction(() => /Pay ₹/.test(document.querySelector("main")?.innerText ?? ""));

  // Opening and closing at the same minute is refused; saving the current hours works.
  const open = await vendor.inputValue("#openTime");
  await vendor.uncheck("input[name='allDay']");
  await vendor.fill("#openTime", "10:00");
  await vendor.fill("#closeTime", "10:00");
  await vendor.getByRole("button", { name: "Save hours" }).click();
  await vendor.waitForURL(/error=hours/);
  await vendor.goto(`${BASE}/vendor/menu`);
  await vendor.getByRole("button", { name: "Save hours" }).click();
  await vendor.waitForURL(/ok=hours/);
  check((await vendor.inputValue("#openTime")) === open, "saving changed the hours");
  await vendor.context().close();
});

await step("the counter downloads today's sales as CSV", async () => {
  const vendor = await vendorSignIn("vendor-export");
  const [download] = await Promise.all([
    vendor.waitForEvent("download"),
    vendor.getByRole("button", { name: "Download CSV" }).click(),
  ]);
  const text = readFileSync(await download.path(), "utf8");
  check(download.suggestedFilename().startsWith("momos-"), `file name ${download.suggestedFilename()}`);
  check(text.includes("Token,Placed (IST),Pickup,Status") && text.includes(token), "CSV is missing the header or today's order");
  await vendor.context().close();
  return `${text.trim().split("\n").length - 1} orders in ${download.suggestedFilename()}`;
});

await step("a ticket opened once is kept for offline, and sign-out wipes it", async () => {
  const phone = await newPage("offline", { width: 390, height: 844 });
  await phone.context().addCookies(await emp.context().cookies());
  await phone.goto(`${BASE}/orders`);
  // Open it the way people do: a client-side link, not a full page load.
  const ticket = phone.locator("main a", { hasText: token });
  const ticketPath = await ticket.getAttribute("href");
  await ticket.click();
  await phone.waitForURL(`${BASE}${ticketPath}`);
  // Playwright's offline switch does not reach service worker requests, so
  // check what was kept; serving it offline is checked by hand.
  const kept = () => phone.evaluate(async (path) => Boolean(await caches.match(path)), ticketPath);
  const until = async (want, ms) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) if ((await kept()) === want) return;
  };
  await until(true, 8000);
  const html = await phone.evaluate(async (path) => (await caches.match(path))?.text(), ticketPath);
  check(html?.includes(token), "the kept copy is not the ticket");

  // Someone else signing in on this browser drops the previous person's copies.
  await phone.evaluate(() => localStorage.setItem("iwf-device-owner", "someone-else"));
  await phone.goto(`${BASE}/orders`);
  await until(false, 5000);
  check(!(await kept()), "another person's ticket survived a new sign-in");

  await phone.goto(`${BASE}/orders`);
  await phone.locator("header").getByRole("button", { name: "Sign out" }).click();
  await phone.waitForURL(`${BASE}/`);
  const left = await phone.evaluate(async () => (await caches.keys()).length);
  check(left === 0, `${left} caches left after sign-out`);
  await phone.context().close();
  return `${token} kept after a link click; wiped for a new owner and on sign-out`;
});

await step("only food court admins see the admin screen, and PIN resets need a fresh code", async () => {
  // The page streams behind the root loading screen, so "not found" arrives as
  // content rather than a 404 status: check what renders.
  await emp.goto(`${BASE}/admin`);
  await emp.getByRole("heading", { name: "Not found" }).waitFor({ timeout: 5000 });
  check((await emp.getByText("Food court admin").count()) === 0, "a regular employee can see the admin screen");

  // In demo mode the demo employee is the admin; a PIN sign-in can view and pause.
  const admin = await newPage("admin");
  await pinSignIn(admin, "9845012345", "4826");
  await admin.waitForURL(`${BASE}/stalls`);
  await admin.goto(`${BASE}/admin`);
  const row = admin.locator("main li", { hasText: "Maggi & Momos" });
  await row.getByRole("button", { name: "Pause orders" }).click();
  await admin.getByText("Maggi & Momos paused").waitFor({ timeout: 5000 });
  try {
    await emp.goto(`${BASE}/stalls/momos`);
    await emp.getByText("This stall has paused new orders").waitFor({ timeout: 5000 });
  } finally {
    await row.getByRole("button", { name: "Resume orders" }).click();
    await admin.getByText("Maggi & Momos is taking orders again").waitFor({ timeout: 5000 });
  }
  admin.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Reset counter PIN" }).click();
  await admin.getByText("sign in again with a one-time code").first().waitFor({ timeout: 5000 });
  await admin.context().close();
  return "404 for employees; pause works; PIN reset refused without a fresh code";
});

await step("a full pickup slot is not offered, and the queue sets the earliest slot", async () => {
  const vendor = await vendorSignIn("vendor-capacity", "idli");
  const setCapacity = async (orders) => {
    await vendor.goto(`${BASE}/vendor/menu`);
    await vendor.fill("#slotCapacity", String(orders));
    await vendor.locator("#slotCapacity").locator("xpath=ancestor::form").getByRole("button", { name: "Save" }).click();
    await vendor.waitForURL(/ok=capacity/);
  };
  await setCapacity(1);
  try {
    await emp.goto(`${BASE}/stalls/idli`, { waitUntil: "networkidle" });
    check(/~\d+ min/.test(await emp.locator("main").innerText()), "no wait estimate on the stall page");
    await emp.locator("main button:has-text('Add')").first().click();
    await emp.goto(`${BASE}/checkout`);
    await emp.waitForFunction(() => /Pay ₹/.test(document.querySelector("main")?.innerText ?? ""));
    const first = emp.locator("main section button:not([disabled])").first();
    const slot = (await first.innerText()).split("\n")[0];
    await emp.locator("main button:has-text('Pay ₹')").click();
    await emp.waitForURL(/\/orders\/[^/]+$/);
    await emp.goto(`${BASE}/stalls/idli`, { waitUntil: "networkidle" });
    await emp.locator("main button:has-text('Add')").first().click();
    await emp.goto(`${BASE}/checkout`);
    await emp.waitForFunction(() => /Pay ₹/.test(document.querySelector("main")?.innerText ?? ""));
    const taken = emp.getByRole("button", { name: `${slot}, full` });
    check((await taken.count()) === 1 && (await taken.isDisabled()), `slot ${slot} is still offered after it filled`);
    return `${slot} shown as full after one order`;
  } finally {
    await setCapacity(12);
    await vendor.context().close();
  }
});

await step("a tampered session cookie is refused", async () => {
  const real = (await emp.context().cookies()).find((c) => c.name === "iwf_employee");
  const [body, signature] = real.value.split(".");
  const flipped = body.slice(0, 10) + (body[10] === "A" ? "B" : "A") + body.slice(11);
  const context = await browser.newContext();
  await context.addCookies([{ name: "iwf_employee", value: `${flipped}.${signature}`, url: BASE }]);
  const page = await context.newPage();
  await page.goto(`${BASE}/stalls`);
  check(page.url() === `${BASE}/enter`, `landed on ${page.url()}`);
  await context.close();
});

await step("sign-in screens fit a phone screen", async () => {
  const mobile = await newPage("mobile", { width: 390, height: 844 });
  const overflow = () => document.documentElement.scrollWidth - window.innerWidth;
  await mobile.goto(`${BASE}/enter`);
  check((await mobile.evaluate(overflow)) <= 0, "sign-in page scrolls sideways");
  await snap(mobile, "07-mobile-sign-in");
  await requestCode(mobile, randomPhone());
  check((await mobile.evaluate(overflow)) <= 0, "verify page scrolls sideways");
  await snap(mobile, "08-mobile-verify");
  await submitCode(mobile, await inboxCode(mobile));
  await mobile.waitForURL(`${BASE}/enter/register`);
  check((await mobile.evaluate(overflow)) <= 0, "register page scrolls sideways");
  await snap(mobile, "09-mobile-register");
  await mobile.context().close();
});

const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

async function axeViolations(page) {
  await page.locator("main").waitFor();
  await page.evaluate(AXE);
  const result = await page.evaluate(() =>
    window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] }),
  );
  return result.violations.map((v) => `${new URL(page.url()).pathname}: ${v.id} (${v.nodes.length})`);
}

await step("pages pass an automated accessibility audit (axe, WCAG 2.1 AA)", async () => {
  const found = [];
  let pages = 0;
  const audit = async (page) => {
    pages += 1;
    found.push(...(await axeViolations(page)));
  };
  const guest = await newPage("axe-guest");
  for (const path of ["/", "/enter", "/enter?method=pin", "/vendor/login"]) {
    await guest.goto(`${BASE}${path}`);
    await audit(guest);
  }
  await guest.context().close();

  const latest = await emp.goto(`${BASE}/orders`).then(() =>
    emp.locator("main a[href^='/orders/']").first().getAttribute("href"),
  );
  for (const path of ["/stalls", "/stalls/momos", "/checkout", "/orders", latest]) {
    await emp.goto(`${BASE}${path}`);
    await audit(emp);
  }

  const vendor = await vendorSignIn("axe-vendor");
  await audit(vendor);
  await vendor.goto(`${BASE}/vendor/menu`);
  await audit(vendor);
  await vendor.context().close();
  check(found.length === 0, found.join("; "));
  return `${pages} pages, no violations`;
});

await step("no console or page errors", async () => {
  check(pageErrors.length === 0, pageErrors.slice(0, 3).join(" || "));
});

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exitCode = passed === results.length ? 0 : 1;
