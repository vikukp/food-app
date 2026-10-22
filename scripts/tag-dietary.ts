// Gives a database made before menus had dietary tags the Egg tags and egg
// allergens of prisma/catalogue.ts (the seed only tags dishes it creates).
//   npm run db:tag-dietary              preview, writes nothing
//   npm run db:tag-dietary -- --apply   write
// It only adds tags, and only to dishes still named and described as the
// catalogue has them; a dish its stall has changed is listed and left alone.
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { catalogueItemId, stalls } from "../prisma/catalogue";
import { addCatalogueTags, allergenLabels } from "../src/lib/dietary";

// Prisma only loads .env; read the same files the app does.
loadEnvConfig(process.cwd());

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();

const tagText = (tags: { egg: boolean; allergens: string }) =>
  [tags.egg ? "Egg" : null, ...allergenLabels(tags.allergens).map((label) => `contains ${label.toLowerCase()}`)]
    .filter(Boolean)
    .join(", ") || "none";

async function main() {
  const changes: { id: string; label: string; before: string; after: string; written: boolean }[] = [];
  const changed: string[] = [];
  let upToDate = 0;
  let missing = 0;

  for (const stall of stalls) {
    for (const item of stall.items) {
      if (!item.egg && !item.allergens) continue;
      const id = catalogueItemId(stall.id, item.slug);
      const label = `${stall.name} · ${item.name}`;
      const current = await prisma.menuItem.findUnique({
        where: { id },
        select: { name: true, description: true, veg: true, egg: true, allergens: true },
      });
      if (!current) {
        missing += 1;
        continue;
      }
      if (current.name !== item.name || current.description !== item.description) {
        changed.push(current.name === item.name ? label : `${label} (now "${current.name}")`);
        continue;
      }
      const next = addCatalogueTags(current, item);
      if (!next) {
        upToDate += 1;
        continue;
      }
      // Only if nobody edited the dish since it was read.
      const written = apply
        ? (
            await prisma.menuItem.updateMany({
              where: { id, name: current.name, description: current.description, egg: current.egg, allergens: current.allergens },
              data: next,
            })
          ).count === 1
        : false;
      changes.push({ id, label, before: tagText(current), after: tagText(next), written });
    }
  }

  console.log(apply ? "Dietary tags from the catalogue:" : "Dietary tags from the catalogue (preview, nothing written):");
  for (const change of changes) {
    const note = apply && !change.written ? "  (skipped: edited while this ran)" : "";
    console.log(`  ${change.label}: ${change.before} → ${change.after}${note}`);
  }
  if (!changes.length) console.log("  Nothing to add.");
  if (changed.length) {
    console.log("Left alone because their stall has renamed or re-described them (tag them under Menu if needed):");
    for (const label of changed) console.log(`  ${label}`);
  }
  const written = changes.filter((change) => change.written).length;
  console.log(
    `${apply ? `${written} tagged` : `${changes.length} to tag`}, ${upToDate} already tagged, ${changed.length} changed by their stall` +
      `${missing ? `, ${missing} not in this database` : ""}.`,
  );
  if (!apply && changes.length) console.log("Run again with --apply to write them: npm run db:tag-dietary -- --apply");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
