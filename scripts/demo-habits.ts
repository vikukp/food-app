// A week of past orders for the demo employee, so the AI assistant's "My
// usual" and its suggestions from favourites can be tried before anyone has
// habits: the same breakfast, lunch, snack and dinner every day. Demo mode
// only, as it writes orders.
//   npm run demo:habits             add the past week (replacing an earlier one)
//   npm run demo:habits -- --clear  take it away
import { loadEnvConfig } from "@next/env";
import { catalogueItemId } from "../prisma/catalogue";
import { DEMO_EMPLOYEE } from "../src/lib/demo";
import { campusClockTime, campusDate, serviceDay } from "../src/lib/hours";
import { demoMode } from "../src/lib/mode";
import { randomToken } from "../src/lib/orders";
import { effectivePrice } from "../src/lib/pricing";

// These orders' payment references start with this.
const MARK = "DEMO-HABITS";
const DAYS = 7;
const MINUTE = 60_000;
const MEALS: { at: string; stallId: string; lines: [slug: string, qty: number][] }[] = [
  { at: "08:30", stallId: "dosa", lines: [["masala", 2], ["filter", 1]] },
  { at: "13:00", stallId: "punjab", lines: [["thali-veg", 1]] },
  { at: "17:00", stallId: "sandwich", lines: [["cold-coffee", 1], ["fries", 1]] },
  { at: "20:30", stallId: "rolls", lines: [["paneer", 1]] },
];

async function main() {
  // Read the same .env files as the app before the database client starts.
  loadEnvConfig(process.cwd());
  if (!demoMode()) {
    console.error("This writes orders into the database, so it runs only in demo mode (DEMO_MODE=1).");
    process.exitCode = 1;
    return;
  }
  const { prisma } = await import("../src/lib/prisma");
  const { employeeId, name, phone, pin } = DEMO_EMPLOYEE;
  const removed = await prisma.order.deleteMany({ where: { employeeId, paymentRef: { startsWith: MARK } } });
  if (process.argv.includes("--clear")) {
    console.log(`Removed ${removed.count} past demo order${removed.count === 1 ? "" : "s"} of ${name}.`);
    return;
  }

  let added = 0;
  for (const meal of MEALS) {
    const stall = await prisma.stall.findUnique({ where: { id: meal.stallId }, include: { items: true } });
    const lines = meal.lines.flatMap(([slug, qty]) => {
      const item = stall?.items.find((i) => i.id === catalogueItemId(meal.stallId, slug) && !i.archived);
      return item ? [{ menuItemId: item.id, name: item.name, qty, priceInr: effectivePrice(item), veg: item.veg }] : [];
    });
    if (!stall || !lines.length) {
      console.log(`Skipped ${meal.at}: the ${meal.stallId} stall or its dishes are gone.`);
      continue;
    }
    for (let daysBack = 1; daysBack <= DAYS; daysBack += 1) {
      // Campus time is IST, as everywhere in the app.
      const day = campusDate(new Date(Date.now() - daysBack * 24 * 60 * MINUTE));
      const placed = new Date(`${day}T${meal.at}:00+05:30`);
      const ready = new Date(placed.getTime() + 15 * MINUTE);
      const tokenDay = serviceDay(stall.openTime, stall.closeTime, placed);
      let token = randomToken();
      while (await prisma.order.count({ where: { stallId: stall.id, tokenDay, token } })) token = randomToken();
      await prisma.order.create({
        data: {
          token,
          tokenDay,
          employeeId,
          employeeName: name,
          stallId: stall.id,
          status: "COLLECTED",
          pickupSlot: campusClockTime(ready),
          pickupAt: ready,
          paymentMethod: "UPI",
          paymentRef: `${MARK}-${day}-${token}`,
          totalInr: lines.reduce((sum, line) => sum + line.priceInr * line.qty, 0),
          createdAt: placed,
          preparingAt: new Date(placed.getTime() + 2 * MINUTE),
          readyAt: ready,
          collectedAt: new Date(ready.getTime() + 3 * MINUTE),
          items: { create: lines },
        },
      });
      added += 1;
    }
    console.log(`${meal.at} at ${stall.name}: ${lines.map((line) => `${line.qty} ${line.name}`).join(", ")}, every day for ${DAYS} days.`);
  }
  console.log(
    `\nAdded ${added} past orders for ${name}. Sign in as them (mobile ${phone}, PIN ${pin}) and open Ask AI within` +
      ` an hour and a half of one of those times to see "My usual"; at other times it offers what they usually like.`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
