import { randomInt } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { DEMO_EMPLOYEE, demoVendorPin } from "../src/lib/demo";
import { demoMode } from "../src/lib/mode";
import { normalizeIndianMobile } from "../src/lib/phone";
import { hashPin, verifyPin } from "../src/lib/pin";
import { catalogueItemId, stalls } from "./catalogue";

// Prisma only loads .env; read the same files the app does. `npm run dev`
// passes --dev so .env.development* count, as they do for `next dev`.
loadEnvConfig(process.cwd(), process.argv.includes("--dev"));

// Demo stalls share one known PIN. Outside demo mode each new stall gets its own
// random PIN, printed once below, unless DEMO_VENDOR_PIN is set explicitly.
function newStallPin() {
  if (demoMode() || process.env.DEMO_VENDOR_PIN) return demoVendorPin();
  return String(randomInt(100000, 1000000));
}
const issuedPins: { stall: string; pin: string }[] = [];

const prisma = new PrismaClient();

function issuedPin(stall: string) {
  const pin = newStallPin();
  issuedPins.push({ stall, pin });
  return pin;
}

// Seeding only fills in what is missing. Once a stall exists, its hours, PIN and
// menu belong to the vendor and are never overwritten by a reseed.
async function main() {
  let createdStalls = 0;
  let createdItems = 0;
  for (const stall of stalls) {
    const existing = await prisma.stall.findUnique({ where: { id: stall.id }, select: { id: true } });
    if (!existing) {
      await prisma.stall.create({
        data: {
          id: stall.id,
          name: stall.name,
          cuisine: stall.cuisine,
          description: stall.description,
          location: stall.location,
          openTime: stall.openTime,
          closeTime: stall.closeTime,
          vegOnly: stall.vegOnly,
          busyLevel: stall.busyLevel,
          vendorPinHash: hashPin(issuedPin(stall.name)),
          accent: stall.accent,
        },
      });
      createdStalls += 1;
    }

    for (const item of stall.items) {
      const id = catalogueItemId(stall.id, item.slug);
      const found = await prisma.menuItem.findUnique({ where: { id }, select: { id: true } });
      if (found) continue;
      await prisma.menuItem.create({
        data: {
          id,
          stallId: stall.id,
          name: item.name,
          description: item.description,
          priceInr: item.priceInr,
          veg: item.veg,
          egg: item.egg ?? false,
          allergens: item.allergens ?? "",
          category: item.category,
          available: item.available ?? true,
        },
      });
      createdItems += 1;
    }
  }

  const demoPhone = normalizeIndianMobile(DEMO_EMPLOYEE.phone)!;
  const demoExists = await prisma.employee.findFirst({
    where: { OR: [{ phone: demoPhone }, { employeeId: DEMO_EMPLOYEE.employeeId }] },
    select: { id: true },
  });
  const addDemo = demoMode() && !demoExists;
  if (addDemo) {
    await prisma.employee.create({
      data: {
        employeeId: DEMO_EMPLOYEE.employeeId,
        name: DEMO_EMPLOYEE.name,
        phone: demoPhone,
        pinHash: hashPin(DEMO_EMPLOYEE.pin),
      },
    });
  }

  console.log(
    `Seed complete: ${stalls.length} stalls known, ${createdStalls} created, ${createdItems} menu items added` +
      `${addDemo ? ", demo employee added" : ""}.`,
  );
  if (!demoMode()) {
    const withDemoPin = (await prisma.stall.findMany({ select: { name: true, vendorPinHash: true } })).filter((stall) =>
      verifyPin(demoVendorPin(), stall.vendorPinHash),
    );
    if (withDemoPin.length) {
      console.warn(
        `Warning: ${withDemoPin.length} stall(s) still use the demo counter PIN ${demoVendorPin()} ` +
          `(${withDemoPin.map((stall) => stall.name).join(", ")}). Change them under Menu before real use.`,
      );
    }
  }
  if (demoExists && !demoMode()) {
    console.warn(`Warning: demo employee ${DEMO_EMPLOYEE.employeeId} exists but DEMO_MODE is off. Delete it before real use.`);
  }
  if (issuedPins.length && !demoMode() && !process.env.DEMO_VENDOR_PIN) {
    console.log("Counter PINs for new stalls (shown once; vendors can change them under Menu):");
    for (const { stall, pin } of issuedPins) console.log(`  ${stall.padEnd(28)} ${pin}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
