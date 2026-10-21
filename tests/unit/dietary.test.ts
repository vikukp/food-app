import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allergenLabels, dietOf, hasEgg, parseAllergens } from "@/lib/dietary";

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
