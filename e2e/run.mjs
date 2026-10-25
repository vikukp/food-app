// Browser checks against a running server in demo mode (DEMO_MODE=1):
//   npm run build && npm start      (in one terminal)
//   npm run test:e2e                (in another)
// BASE_URL, CHROME_PATH and SCREENSHOT_DIR are optional. Every run registers
// fresh random mobile numbers and never touches the demo employee.
import { randomInt } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import { startAiStub } from "./ai-stub.mjs";

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:43123").replace(/\/+$/, "");
const VENDOR_PIN = process.env.DEMO_VENDOR_PIN ?? "1234";
const SHOTS = process.env.SCREENSHOT_DIR;
const RESEND_WAIT_MS = 31_000;
// With AI_STUB_PORT set (and the app's AI_* settings pointing at it), the assistant is tested against a stand-in model.
const aiStub = process.env.AI_STUB_PORT ? startAiStub(Number(process.env.AI_STUB_PORT)) : null;
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
  const message = page.getByText(/is your Campus Food Court sign-in code/);
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
  check((await emp.context().cookies()).every((c) => c.name !== "fc_otp"), "code ticket cookie left behind");
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
  await submitRegistration(emp, { name: user.name, employeeId: "EMP-48219", pin });
  await emp.waitForURL(/error=idtaken/);
  check((await alertText(emp)).includes("already registered"), "no duplicate-ID message");
});

await step("registration signs you in", async () => {
  await submitRegistration(emp, { name: user.name, employeeId: user.employeeId, pin });
  await emp.waitForURL(`${BASE}/stalls`);
  check((await emp.locator("header").innerText()).includes(user.name), "name missing from the header");
  const cookies = await emp.context().cookies();
  const session = cookies.find((c) => c.name === "fc_employee");
  check(session?.httpOnly && session.sameSite === "Lax", "session cookie is not HttpOnly + SameSite=Lax");
  check(cookies.every((c) => c.name !== "fc_reg"), "registration ticket cookie left behind");
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

await step("a dish in the bag turns Add into − 1 +, and the header marks the page", async () => {
  await emp.goto(`${BASE}/stalls/momos`, { waitUntil: "networkidle" });
  const current = (await emp.locator("header a[aria-current='page']").innerText()).trim();
  check(current === "Stalls", `the header marks "${current}" on a stall page`);
  const first = emp.locator("main li").filter({ has: emp.getByRole("button", { name: "Add", exact: true }) }).first();
  const name = (await first.locator("p.font-medium").first().innerText()).trim();
  // Pin the row by its dish: once it is in the bag it no longer has an Add button.
  const row = emp.locator("main li").filter({ hasText: name }).first();
  await row.getByRole("button", { name: "Add", exact: true }).click();
  const plus = row.getByRole("button", { name: `One more ${name}` });
  await plus.waitFor({ timeout: 5000 });
  check(await plus.evaluate((b) => b === document.activeElement), "focus did not move to + after Add");
  check((await row.getByRole("button", { name: "Add", exact: true }).count()) === 0, "Add is still shown next to the stepper");
  await plus.click();
  await row.getByRole("button", { name: `One less ${name}` }).click();
  await row.getByRole("button", { name: `Remove ${name}` }).click();
  const add = row.getByRole("button", { name: "Add", exact: true });
  await add.waitFor({ timeout: 5000 });
  check(await add.evaluate((b) => b === document.activeElement), "focus was lost when − took the last one out");
  return `${name}: Add → − 1 + → 2 → 1 → Add again`;
});

let token = "";
await step("order from a stall and get a QR token", async () => {
  await emp.goto(`${BASE}/stalls/momos`, { waitUntil: "networkidle" });
  await addFirstItem(emp);
  await emp.locator("header button:has-text('Bag')").click();
  await emp.locator("[data-slot='sheet-content'] a:has-text('Choose pickup time')").click();
  await emp.waitForURL(`${BASE}/checkout`);
  await waitForPay(emp);
  check((await emp.locator("main a[href='/stalls']", { hasText: "Back to stalls" }).count()) === 1, "checkout has no way back to the stalls");
  await emp.locator("main button:has-text('Pay ₹')").click();
  await emp.waitForURL(/\/orders\/[^/]+$/);
  token = (await emp.locator("main").innerText()).match(/\bT-\d{4}\b/)?.[0] ?? "";
  check(token && (await emp.locator("main img[alt*='QR']").count()) === 1, "token or QR missing");
  check((await emp.locator("header a[aria-current='page']").innerText()).trim() === "Orders", "the header does not mark Orders on a ticket");
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

await step("the counter display shows the token ready, and the ticket's timeline records it", async () => {
  const board = await newPage("display", { width: 1280, height: 720 });
  await board.goto(`${BASE}/display/momos`);
  const ready = board.getByRole("region", { name: "Ready for pickup" });
  await ready.getByText(token.replace("T-", ""), { exact: true }).waitFor({ timeout: 5000 });
  check(!(await board.locator("body").innerText()).includes(user.name), "the public display shows a name");
  await board.context().close();
  const progress = await emp.getByRole("list", { name: "Order progress" }).innerText();
  check(/Ready\s+\d{2}:\d{2}/.test(progress), `timeline has no ready time: ${progress.replace(/\s+/g, " ")}`);
  return "token on the ready board; ready time on the ticket";
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

// Adds the first item on the stall page open in `page`; returns its name.
// Read before the click: once added, the row shows − 1 + and no longer matches.
async function addFirstItem(page) {
  const row = page.locator("main li").filter({ has: page.locator("button:has-text('Add')") }).first();
  const name = (await row.locator("p.font-medium").first().innerText()).trim();
  await row.getByRole("button", { name: "Add", exact: true }).click();
  return name;
}

// Empties the bag (it lives in localStorage), then adds the first item of one stall.
async function freshBag(page, stallId) {
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) if (key.startsWith("fc-cart")) localStorage.removeItem(key);
  });
  await page.goto(`${BASE}/stalls/${stallId}`, { waitUntil: "networkidle" });
  return addFirstItem(page);
}

const payButton = (page) => page.locator("main aside button:has-text('Pay ₹')");

// Checkout is ready to pay: the bag has loaded and nothing blocks the Pay button.
async function waitForPay(page) {
  await page.waitForFunction(() => {
    const pay = [...document.querySelectorAll("main aside button")].find((b) => /Pay ₹/.test(b.textContent ?? ""));
    return pay && !pay.disabled;
  });
}

async function placeMomosOrder(page) {
  await freshBag(page, "momos");
  await page.goto(`${BASE}/checkout`);
  await waitForPay(page);
  await page.locator("main button:has-text('Pay ₹')").click();
  await page.waitForURL(/\/orders\/[^/]+$/);
  return (await page.locator("main").innerText()).match(/\bT-\d{4}\b/)?.[0] ?? "";
}

await step("an employee can cancel in the first 30 seconds, before the kitchen starts", async () => {
  const cancelToken = await placeMomosOrder(emp);
  await emp.getByText(/You can cancel for \d+ more seconds?\./).waitFor({ timeout: 5000 });
  await emp.getByRole("button", { name: "Cancel order" }).click();
  await emp.getByRole("button", { name: "Yes, cancel it" }).click();
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
  const digits = token.replace("T-", "");
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

await step("a collected order can be rated, the stall sees it, and the receipt splits out GST", async () => {
  await emp.goto(`${BASE}/orders`);
  await emp.locator("main a", { hasText: token }).click();
  await emp.waitForURL(/\/orders\/[^/]+$/);
  const ticketUrl = emp.url();
  await emp.getByRole("radio", { name: "2 stars" }).click();
  await emp.getByLabel("What went wrong?", { exact: false }).fill("Momos were cold");
  await emp.getByRole("button", { name: "Send" }).click();
  await emp.getByText("You rated this 2 out of 5").waitFor({ timeout: 5000 });

  const vendor = await vendorSignIn("vendor-feedback");
  await vendor.goto(`${BASE}/vendor/menu`);
  await vendor.getByText("Momos were cold").first().waitFor({ timeout: 5000 });
  await vendor.context().close();

  await emp.goto(`${ticketUrl}/receipt`);
  const receipt = await emp.locator("main").innerText();
  check(/CGST 2\.5%/.test(receipt) && /SGST 2\.5%/.test(receipt) && receipt.includes(token), "receipt is missing GST lines or the token");
  return "rated 2★ with a comment; stall sees it; receipt shows CGST/SGST";
});

await step("order again refills the bag from a past order", async () => {
  await emp.goto(`${BASE}/orders`);
  await emp.locator("main a", { hasText: token }).click();
  await emp.waitForURL(/\/orders\/[^/]+$/);
  await emp.getByRole("button", { name: "Order again" }).click();
  await emp.waitForURL(`${BASE}/checkout`);
  await waitForPay(emp);
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
    check(await payButton(emp).isDisabled(), "checkout lets you pay while the stall is paused");
  } finally {
    await vendor.goto(`${BASE}/vendor/menu`);
    await vendor.getByRole("button", { name: "Resume orders" }).click();
    await vendor.waitForURL(/ok=resumed/);
  }
  await emp.goto(`${BASE}/checkout`);
  await waitForPay(emp);

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

let checkoutTicket = "";
await step("one bag from two stalls: one payment, a token per stall, and each counter sees only its part", async () => {
  const momosDish = await freshBag(emp, "momos");
  await emp.goto(`${BASE}/stalls/idli`, { waitUntil: "networkidle" });
  const idliDish = await addFirstItem(emp);
  await emp.locator("header button:has-text('Bag')").click();
  const sheet = emp.locator("[data-slot='sheet-content']");
  const bag = await sheet.innerText();
  check(bag.includes("Maggi & Momos") && bag.includes("Idli & Filter Coffee"), `the bag lost a stall: ${bag.replace(/\s+/g, " ")}`);
  await sheet.locator("a:has-text('Choose pickup times')").click();
  await emp.waitForURL(`${BASE}/checkout`);
  await waitForPay(emp);

  // A pickup time per stall: take the second slot at Idli.
  check((await emp.getByRole("group", { name: /^Pickup time at / }).count()) === 2, "checkout does not ask for two pickup times");
  const idliSlots = emp.getByRole("group", { name: "Pickup time at Idli & Filter Coffee" }).locator("button:not([disabled])");
  const idliSlot = (await idliSlots.nth(1).innerText()).split("\n")[0];
  await idliSlots.nth(1).click();
  const total = (await payButton(emp).innerText()).trim();
  await payButton(emp).click();
  await emp.waitForURL(/\/orders\/[^/]+$/);
  checkoutTicket = emp.url();

  const strip = emp.getByRole("navigation", { name: "Tickets paid for together" });
  await strip.waitFor({ timeout: 5000 });
  const tokens = (await strip.innerText()).match(/\bT-\d{4}\b/g) ?? [];
  check(tokens.length === 2, `expected 2 tokens, got ${tokens.join(", ")}`);
  check((await emp.locator("h1").innerText()).trim() === tokens[0], "checkout did not land on the first stall's ticket");
  check((await strip.innerText()).includes(`Idli & Filter Coffee · ${idliSlot}`), "the Idli ticket lost its own pickup time");
  const idliTicket = await strip.locator("a", { hasText: tokens[1] }).getAttribute("href");
  // Opening one ticket keeps the other for offline too.
  let kept = false;
  for (const end = Date.now() + 8000; !kept && Date.now() < end; await sleep(200)) {
    kept = await emp.evaluate(async (path) => Boolean(await caches.match(path)), idliTicket);
  }
  check(kept, "the other ticket was not kept for offline");

  // Each counter sees only its own part, under its own token.
  const momos = await vendorSignIn("vendor-multi-momos");
  const momosCard = momos.locator("main li", { hasText: tokens[0] });
  await momosCard.waitFor({ timeout: 8000 });
  const momosText = await momosCard.innerText();
  check(momosText.includes(momosDish) && !momosText.includes(idliDish), `the Momos counter card is wrong: ${momosText.replace(/\s+/g, " ")}`);
  check(!(await momos.locator("main").innerText()).includes(idliDish), "the Momos counter sees the Idli dish");
  const idli = await vendorSignIn("vendor-multi-idli", "idli");
  const idliCard = idli.locator("main li", { hasText: tokens[1] });
  await idliCard.waitFor({ timeout: 8000 });
  check((await idliCard.innerText()).includes(idliDish), "the Idli counter card is missing its dish");
  await idli.context().close();

  // On the Idli ticket, the Momos ticket's status follows the counter.
  await strip.locator("a", { hasText: tokens[1] }).click();
  await emp.waitForURL(`${BASE}${idliTicket}`);
  check((await emp.locator("h1").innerText()).trim() === tokens[1], "the strip link opened the wrong ticket");
  await momosCard.getByRole("button", { name: "Start preparing" }).click();
  await momosCard.getByRole("button", { name: "Mark ready" }).click();
  await emp
    .getByRole("navigation", { name: "Tickets paid for together" })
    .locator("a", { hasText: tokens[0] })
    .getByText("Ready for pickup")
    .waitFor({ timeout: 12_000 });
  await emp.getByRole("status").getByText(`${tokens[0]} at Maggi & Momos is ready.`).waitFor({ timeout: 5000 });
  check((await emp.title()).startsWith(`Ready · ${tokens[0]}`), `tab title is "${await emp.title()}"`);
  await momos.context().close();

  // My orders shows one card for the payment; Order again brings back both stalls.
  await emp.goto(`${BASE}/orders`);
  const card = emp.locator("main > ul > li").filter({ hasText: tokens[0] }).filter({ hasText: tokens[1] });
  check(
    (await card.count()) === 1 && (await card.innerText()).includes("2 stalls, paid together"),
    "My orders does not show the two tickets as one payment",
  );
  await emp.goto(`${BASE}${idliTicket}`);
  await emp.getByRole("button", { name: "Order again" }).click();
  await emp.waitForURL(`${BASE}/checkout`);
  await waitForPay(emp);
  check((await emp.getByRole("group", { name: /^Pickup time at / }).count()) === 2, "Order again brought back one stall");
  return `${tokens.join(" + ")} for ${total.replace("Pay ", "")} in one payment; each counter saw its own; order again refilled both`;
});

await step("in the first 30 seconds, every ticket from one payment can be cancelled at once", async () => {
  await freshBag(emp, "momos");
  await emp.goto(`${BASE}/stalls/idli`, { waitUntil: "networkidle" });
  await addFirstItem(emp);
  await emp.goto(`${BASE}/checkout`);
  await waitForPay(emp);
  await payButton(emp).click();
  await emp.waitForURL(/\/orders\/[^/]+$/);
  await emp.getByRole("button", { name: "Cancel order" }).click();
  await emp.getByRole("button", { name: "Cancel all 2 tickets" }).click();
  await emp.getByText("You cancelled this order.").waitFor({ timeout: 8000 });
  const strip = emp.getByRole("navigation", { name: "Tickets paid for together" });
  const cancelled = (await strip.innerText()).match(/Cancelled/g)?.length ?? 0;
  check(cancelled === 2, `${cancelled} of 2 tickets show as cancelled`);
  // The other ticket is cancelled on the server too, not just on this screen.
  await strip.locator("a").first().click();
  await emp.getByText("You cancelled this order.").waitFor({ timeout: 8000 });
  return "both tickets cancelled from one ticket";
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
  await phone.evaluate(() => localStorage.setItem("fc-device-owner", "someone-else"));
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
  await row.getByRole("button", { name: "Reset counter PIN" }).click();
  await row.getByRole("button", { name: "Yes, reset the PIN" }).click();
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
    await freshBag(emp, "idli");
    check(/~\d+ min/.test(await emp.locator("main").innerText()), "no wait estimate on the stall page");
    await emp.goto(`${BASE}/checkout`);
    await waitForPay(emp);
    const first = emp.getByRole("group", { name: /^Pickup time at / }).locator("button:not([disabled])").first();
    const slot = (await first.innerText()).split("\n")[0];
    await emp.locator("main button:has-text('Pay ₹')").click();
    await emp.waitForURL(/\/orders\/[^/]+$/);
    await freshBag(emp, "idli");
    await emp.goto(`${BASE}/checkout`);
    await waitForPay(emp);
    const taken = emp.getByRole("button", { name: `${slot}, full` });
    check((await taken.count()) === 1 && (await taken.isDisabled()), `slot ${slot} is still offered after it filled`);
    return `${slot} shown as full after one order`;
  } finally {
    await setCapacity(12);
    await vendor.context().close();
  }
});

await step("a stall's dietary info shows on the menu and the Jain filter uses it", async () => {
  const vendor = await vendorSignIn("vendor-dietary", "idli");
  await vendor.goto(`${BASE}/vendor/menu`);
  const card = vendor.locator("main li").filter({ has: vendor.locator("summary") }).first();
  const name = (await card.locator("p.font-medium").first().innerText()).trim();
  const edit = async (on) => {
    await vendor.goto(`${BASE}/vendor/menu`);
    const item = vendor.locator("main li", { hasText: name }).first();
    await item.locator("summary").click();
    const form = item.locator("form", { has: vendor.getByRole("button", { name: "Save changes" }) });
    await form.locator("input[name='kcal']").fill(on ? "250" : "");
    await form.locator("input[name='jain']").setChecked(on);
    await form.locator("input[name='allergen'][value='milk']").setChecked(on);
    await form.getByRole("button", { name: "Save changes" }).click();
    await vendor.waitForURL(/ok=saved/);
  };
  await edit(true);
  try {
    await emp.goto(`${BASE}/stalls/idli`);
    const row = emp.locator("main li", { hasText: name }).first();
    const text = await row.innerText();
    check(text.includes("250 kcal") && text.includes("Jain") && text.includes("Contains milk"), `badges missing: ${text}`);
    await emp.getByRole("button", { name: "Jain", exact: true }).click();
    const listed = await emp.locator("main ul li").count();
    check(listed === 1, `Jain filter shows ${listed} items, expected 1`);
  } finally {
    await edit(false);
    await vendor.context().close();
  }
  return `${name}: kcal, Jain and allergen shown; Jain filter narrows to it`;
});

await step("a sold-out item blocks paying until it is removed, and the rest of the bag still goes through", async () => {
  const firstName = await freshBag(emp, "momos");
  await emp.goto(`${BASE}/stalls/idli`, { waitUntil: "networkidle" });
  await addFirstItem(emp);
  await emp.goto(`${BASE}/checkout`);
  await waitForPay(emp);

  // Maggi & Momos sells out of it while it sits in the bag.
  const vendor = await vendorSignIn("vendor-soldout");
  await vendor.goto(`${BASE}/vendor/menu`);
  const item = vendor.locator("main li", { hasText: firstName }).first();
  await item.getByRole("button", { name: "Mark sold out" }).click();
  await vendor.waitForURL(/ok=soldout/);
  try {
    await emp.reload();
    await emp.getByText("Sold out now").waitFor({ timeout: 8000 });
    check(await payButton(emp).isDisabled(), "Pay is enabled with a sold-out item");
    // Removing the only Maggi & Momos dish takes that stall out; Idli pays on its own.
    await emp.getByText("Sold out now").getByRole("button", { name: "Remove" }).click();
    await waitForPay(emp);
    check(
      (await emp.getByRole("group", { name: /^Pickup time at / }).count()) === 1 &&
        !(await emp.locator("main aside").innerText()).includes("Maggi & Momos"),
      "the emptied stall is still in the bag",
    );
  } finally {
    await vendor.goto(`${BASE}/vendor/menu`);
    await vendor.locator("main li", { hasText: firstName }).first().getByRole("button", { name: "Back on sale" }).click();
    await vendor.waitForURL(/ok=available/);
    await vendor.context().close();
  }

  // Search finds dishes, not only stalls.
  await emp.goto(`${BASE}/stalls`);
  await emp.getByLabel("Search stalls and dishes").fill(firstName.split(" ").slice(-1)[0]);
  await emp.getByText(`Has `, { exact: false }).first().waitFor({ timeout: 5000 });
  return `"${firstName}" sold out blocked Pay until removed; the other stall stayed; dish search works`;
});

await step("a tampered session cookie is refused", async () => {
  const real = (await emp.context().cookies()).find((c) => c.name === "fc_employee");
  const [body, signature] = real.value.split(".");
  const flipped = body.slice(0, 10) + (body[10] === "A" ? "B" : "A") + body.slice(11);
  const context = await browser.newContext();
  await context.addCookies([{ name: "fc_employee", value: `${flipped}.${signature}`, url: BASE }]);
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

// Side in pixels of each icon the brand routes draw.
const BRAND_ICON_SIDES = {
  "icon-32.png": 32,
  "icon-192.png": 192,
  "icon-512.png": 512,
  "apple-icon.png": 180,
  "icon-maskable.png": 512,
  "favicon.ico": 32,
};

await step("the name, logo and icons come from the brand settings", async () => {
  const page = await newPage("brand");
  await page.goto(`${BASE}/`);
  const wordmark = (await page.locator("header a").first().innerText()).replace(/\s+/g, " ").trim();
  check(wordmark.toLowerCase() === "campus food court", `header shows "${wordmark}"`);
  check((await page.title()).endsWith("Campus Food Court"), `title is "${await page.title()}"`);
  const links = await page
    .locator("head link[rel='icon'], head link[rel='apple-touch-icon']")
    .evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  const manifest = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
  check(manifest.name === "Campus Food Court" && manifest.short_name === "Food Court", "manifest names");
  const urls = [...links, ...manifest.icons.map((icon) => icon.src)];
  check(urls.length >= 6 && urls.every((url) => /^\/brand\/[a-z0-9-]+\.(png|svg)\?v=[0-9a-f]{12}$/.test(url)), urls.join(" "));
  for (const url of [...urls, "/favicon.ico"]) {
    const response = await fetch(`${BASE}${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const name = url.split("?")[0].split("/").pop();
    check(response.ok, `${url}: ${response.status}`);
    if (url.includes("?v=")) check(response.headers.get("cache-control")?.includes("immutable"), `${url} is not cached`);
    if (name === "logo.svg") {
      check(bytes.toString("utf8").includes("<svg"), "logo.svg is not an SVG");
      check(response.headers.get("content-security-policy")?.includes("sandbox"), "the SVG logo is not sandboxed");
      continue;
    }
    const side = BRAND_ICON_SIDES[name];
    check(response.headers.get("content-type") === "image/png", `${url}: ${response.headers.get("content-type")}`);
    check(side && bytes.readUInt32BE(16) === side && bytes.readUInt32BE(20) === side, `${url} is not ${side}px square`);
  }
  check((await fetch(`${BASE}/brand/other.png`)).status === 404, "an unknown brand file was served");
  await page.context().close();
  return `header, title, manifest and ${urls.length + 1} icons`;
});

const AXE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

async function axeViolations(page) {
  await page.locator("main").waitFor();
  // A toast fading in or out is caught at part opacity, which reads as low contrast.
  await page.locator("[data-sonner-toast]").first().waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  await page.evaluate(AXE);
  const result = await page.evaluate(() =>
    window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] }),
  );
  return result.violations.map((v) => `${new URL(page.url()).pathname}: ${v.id} (${v.nodes.length})`);
}

await step("the AI assistant fills the bag from a chat, and paying stays with the person", async () => {
  if (!aiStub) return "skipped: AI_STUB_PORT is not set";
  const clearBagAndChat = () =>
    emp.evaluate(() => {
      for (const key of Object.keys(localStorage)) if (key.startsWith("fc-cart")) localStorage.removeItem(key);
      for (const key of Object.keys(sessionStorage)) if (key.startsWith("fc-assistant")) sessionStorage.removeItem(key);
    });
  await emp.goto(`${BASE}/stalls`);
  await clearBagAndChat();
  await emp.goto(`${BASE}/stalls/dosa`, { waitUntil: "networkidle" });
  await emp.getByRole("button", { name: "Ask AI" }).click();
  const chat = emp.getByRole("dialog", { name: "Order with AI" });
  await chat.waitFor();
  const box = chat.getByLabel("Message the assistant");
  await box.fill("2 masala dosa");
  await box.press("Enter");
  await chat.getByText(/Added 2 Masala dosa from Dosa Counter\. Your bag is now ₹180\./).waitFor({ timeout: 15000 });
  const pay = chat.locator("a[href='/checkout']");
  check((await pay.innerText()).replace(/\s+/g, " ").includes("2 items · ₹180"), "the bag does not hold the 2 dosas");
  const [first] = aiStub.requests;
  check(first?.headers["x-api-key"] === process.env.AI_API_KEY, "the key was not sent as x-api-key");
  check(first.body.system.includes("ordering assistant of Campus Food Court"), "the brand name is not in the instructions");
  const tools = first.body.tools.map((tool) => tool.name);
  check(tools.includes("add_to_bag") && !tools.some((name) => /pay|checkout|order/.test(name)), `tools: ${tools.join(", ")}`);
  check(!("betas" in first.body) && !("cache_control" in first.body), "Claude-only fields went to a router");
  const violations = await axeViolations(emp);
  check(violations.length === 0, violations.join("; "));
  await emp.keyboard.press("Escape");
  await clearBagAndChat();
  return `"2 masala dosa": ${aiStub.requests.length} model calls, 2 in the bag, chat passes axe`;
});

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
  for (const path of ["/stalls", "/stalls/momos", "/orders", latest, new URL(checkoutTicket).pathname]) {
    await emp.goto(`${BASE}${path}`);
    await audit(emp);
  }
  // A menu showing − 1 +, then checkout with a bag from two stalls.
  await freshBag(emp, "momos");
  await audit(emp);
  await emp.goto(`${BASE}/stalls/idli`, { waitUntil: "networkidle" });
  await addFirstItem(emp);
  await emp.goto(`${BASE}/checkout`);
  await waitForPay(emp);
  await audit(emp);

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

aiStub?.close();
await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exitCode = passed === results.length ? 0 : 1;
