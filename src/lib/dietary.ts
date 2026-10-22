// Dietary labels for menu items. "Egg" is non-vegetarian under FSSAI but is
// shown on its own, as Indian menus usually do; Jain means no onion, garlic or
// root vegetables, which a plain "veg" mark does not promise.

export const DIETS = ["veg", "egg", "nonveg"] as const;
export type Diet = (typeof DIETS)[number];

export const ALLERGENS = [
  { id: "milk", label: "Milk" },
  { id: "gluten", label: "Gluten" },
  { id: "peanut", label: "Peanuts" },
  { id: "treenut", label: "Tree nuts" },
  { id: "soy", label: "Soy" },
  { id: "sesame", label: "Sesame" },
  { id: "mustard", label: "Mustard" },
  { id: "egg", label: "Egg" },
  { id: "fish", label: "Fish" },
  { id: "shellfish", label: "Shellfish" },
] as const;

const ALLERGEN_IDS: ReadonlySet<string> = new Set(ALLERGENS.map((a) => a.id));

export function dietOf(item: { veg: boolean; egg: boolean }): Diet {
  return item.veg ? "veg" : item.egg ? "egg" : "nonveg";
}

// Stored as a comma-separated list of ids; unknown ids are dropped.
export function parseAllergens(stored: string | null | undefined): string[] {
  return (stored ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => ALLERGEN_IDS.has(id));
}

export function allergenLabels(stored: string | null | undefined) {
  const ids = new Set(parseAllergens(stored));
  return ALLERGENS.filter((a) => ids.has(a.id)).map((a) => a.label);
}

export function hasEgg(item: { veg: boolean; egg: boolean; allergens: string }) {
  return item.egg || parseAllergens(item.allergens).includes("egg");
}

// Tags the starter catalogue gives a dish, added to what the database has:
// nothing is taken away, and Egg goes only on a non-veg dish, as in the menu
// editor. Null when there is nothing to add.
export function addCatalogueTags(
  current: { veg: boolean; egg: boolean; allergens: string },
  catalogue: { egg?: boolean; allergens?: string },
) {
  const have = parseAllergens(current.allergens);
  const missing = parseAllergens(catalogue.allergens).filter((id) => !have.includes(id));
  const egg = current.egg || (Boolean(catalogue.egg) && !current.veg);
  if (!missing.length && egg === current.egg) return null;
  // Sorted ids, as the menu editor stores them.
  return { egg, allergens: [...have, ...missing].sort().join(",") };
}
