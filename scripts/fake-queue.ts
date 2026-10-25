// A fake queue, for trying what depends on how busy the counters are (wait
// times, pickup slots, the AI assistant's suggestions) without placing real
// orders: orders that wait at a stall's counter like any other, marked so
// they can be cleared again. Demo mode only, as it writes orders.
//   npm run demo:queue                       every stall's queue and wait
//   npm run demo:queue -- dosa=12 punjab=5   add that many waiting orders
//   npm run demo:queue -- --clear            take every fake order away
import { randomInt } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { campusClockTime, isStallOpen, serviceDay, waitCopy } from "../src/lib/hours";
import { demoMode } from "../src/lib/mode";
import { randomToken } from "../src/lib/orders";
import { effectivePrice } from "../src/lib/pricing";

// Fake orders carry this in place of an employee ID.
const FAKE = "FAKE-QUEUE";
const MAX_PER_STALL = 60;
const FIVE_MINUTES = 5 * 60_000;

async function main() {
  // Read the same .env files as the app before the database client starts.
  loadEnvConfig(process.cwd());
  if (!demoMode()) {
    console.error("The fake queue writes orders into the database, so it runs only in demo mode (DEMO_MODE=1).");
    process.exitCode = 1;
    return;
  }
  const { prisma } = await import("../src/lib/prisma");
  const { activeOrderCounts } = await import("../src/lib/stall-load");
  const args = process.argv.slice(2);

  if (args.includes("--clear")) {
    const { count } = await prisma.order.deleteMany({ where: { employeeId: FAKE } });
    console.log(`Removed ${count} fake order${count === 1 ? "" : "s"}.`);
  }

  for (const arg of args.filter((a) => a !== "--clear")) {
    const [id, wanted] = arg.split("=");
    const count = Number(wanted);
    if (!id || !Number.isInteger(count) || count < 1 || count > MAX_PER_STALL) {
      console.error(`"${arg}": write stall=count, like dosa=12 (1 to ${MAX_PER_STALL}).`);
      process.exitCode = 1;
      continue;
    }
    const stall = await prisma.stall.findUnique({
      where: { id },
      include: { items: { where: { archived: false, available: true } } },
    });
    if (!stall) {
      const ids = (await prisma.stall.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((s) => s.id);
      console.error(`No stall "${id}". Stalls: ${ids.join(", ")}.`);
      process.exitCode = 1;
      continue;
    }
    if (stall.paused || !isStallOpen(stall.openTime, stall.closeTime) || !stall.items.length) {
      console.error(`${stall.name} is not taking orders now, so it has no queue to fake.`);
      process.exitCode = 1;
      continue;
    }

    // Due over the next 20 minutes, on 5-minute marks: the queue the kitchen
    // has now. Off the pickup slots' times, they take no place from real orders.
    const tokenDay = serviceDay(stall.openTime, stall.closeTime);
    const firstMark = Math.ceil(Date.now() / FIVE_MINUTES) * FIVE_MINUTES;
    for (let added = 0; added < count; added += 1) {
      const lines = Array.from({ length: randomInt(1, 3) }, () => stall.items[randomInt(stall.items.length)])
        .filter((item, index, all) => all.indexOf(item) === index)
        .map((item) => ({ menuItemId: item.id, name: item.name, qty: randomInt(1, 3), priceInr: effectivePrice(item), veg: item.veg }));
      let token = randomToken();
      while (await prisma.order.count({ where: { stallId: stall.id, tokenDay, token } })) token = randomToken();
      const pickupAt = new Date(firstMark + (added % 4) * FIVE_MINUTES);
      // The first third are already on the stove.
      const preparing = added < count / 3;
      await prisma.order.create({
        data: {
          token,
          tokenDay,
          employeeId: FAKE,
          employeeName: `Queue test ${added + 1}`,
          stallId: stall.id,
          status: preparing ? "PREPARING" : "PLACED",
          preparingAt: preparing ? new Date() : null,
          pickupSlot: campusClockTime(pickupAt),
          pickupAt,
          paymentMethod: "UPI",
          paymentRef: `${FAKE}-${tokenDay}-${token}`,
          totalInr: lines.reduce((sum, line) => sum + line.priceInr * line.qty, 0),
          items: { create: lines },
        },
      });
    }
    console.log(`${stall.name}: added ${count} fake order${count === 1 ? "" : "s"}.`);
  }

  // What every stall's queue looks like now, as the menus and the assistant see it.
  const stalls = await prisma.stall.findMany({ orderBy: { name: "asc" } });
  const active = await activeOrderCounts();
  const fake = await prisma.order.groupBy({
    by: ["stallId"],
    where: { employeeId: FAKE, status: { in: ["PLACED", "PREPARING"] } },
    _count: { _all: true },
  });
  const fakeBy = new Map(fake.map((row) => [row.stallId, row._count._all]));
  console.log(`\n${"Stall".padEnd(36)}${"Queue".padStart(6)}${"Fake".padStart(6)}  Wait`);
  for (const stall of stalls) {
    const open = !stall.paused && isStallOpen(stall.openTime, stall.closeTime);
    const queue = active.get(stall.id) ?? 0;
    const name = `${stall.id} · ${stall.name}`.slice(0, 35).padEnd(36);
    const wait = stall.paused ? "paused" : open ? waitCopy(queue, stall.prepMinutes) : "closed";
    console.log(`${name}${String(queue).padStart(6)}${String(fakeBy.get(stall.id) ?? 0).padStart(6)}  ${wait}`);
  }
  if (!args.length) console.log("\nAdd a queue: npm run demo:queue -- dosa=12   Clear it: npm run demo:queue -- --clear");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
