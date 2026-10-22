import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addCatalogueTags, allergenLabels, dietOf, hasEgg, parseAllergens } from "@/lib/dietary";
import { stalls } from "../../prisma/catalogue";

describe("dietary labels", () => {
  it("tells veg, egg and non-veg apart", () => {
    assert.equal(dietOf({ veg: true, egg: false }), "veg");
    assert.equal(dietOf({ veg: false, egg: true }), "egg");
    assert.equal(dietOf({ veg: false, egg: false }), "nonveg");
  });

  it("keeps only known allergens, in a fixed order", () => {
    assert.deepEqual(parseAllergens("gluten, milk,unicorn,,"), ["gluten", "milk"]);
    assert.deepEqual(allergenLabels("treenut,milk"), ["Milk", "Tree nuts"]);
    assert.deepEqual(allergenLabels(""), []);
  });

  it("treats egg as an allergen too for the no-egg filter", () => {
    assert.equal(hasEgg({ veg: false, egg: true, allergens: "" }), true);
    assert.equal(hasEgg({ veg: true, egg: false, allergens: "milk,egg" }), true);
    assert.equal(hasEgg({ veg: true, egg: false, allergens: "milk" }), false);
  });
});

describe("catalogue tags for an existing database", () => {
  const plain = { veg: false, egg: false, allergens: "" };

  it("adds Egg to a non-veg dish, never to a veg one", () => {
    assert.deepEqual(addCatalogueTags(plain, { egg: true }), { egg: true, allergens: "" });
    assert.equal(addCatalogueTags({ ...plain, veg: true }, { egg: true }), null);
  });

  it("adds allergens to the stall's own, sorted as the menu editor stores them", () => {
    assert.deepEqual(addCatalogueTags({ ...plain, allergens: "soy,milk" }, { allergens: "egg" }), {
      egg: false,
      allergens: "egg,milk,soy",
    });
  });

  it("takes nothing away and reports nothing to do", () => {
    assert.equal(addCatalogueTags({ ...plain, egg: true, allergens: "egg,milk" }, { allergens: "egg" }), null);
    assert.equal(addCatalogueTags({ ...plain, egg: true }, {}), null);
    assert.equal(addCatalogueTags(plain, { allergens: "unicorn" }), null);
  });

  it("the catalogue only tags non-veg dishes as Egg, with known allergens in stored order", () => {
    for (const stall of stalls) {
      for (const item of stall.items) {
        if (item.egg) assert.equal(item.veg, false, `${stall.id}-${item.slug}`);
        const stored = parseAllergens(item.allergens).sort().join(",");
        assert.equal(item.allergens ?? "", stored, `${stall.id}-${item.slug}`);
      }
    }
  });
});
