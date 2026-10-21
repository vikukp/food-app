import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GSTIN_PATTERN, gstBreakup } from "@/lib/gst";

describe("GST receipt", () => {
  it("splits an inclusive price into taxable value and equal CGST/SGST", () => {
    assert.deepEqual(gstBreakup(105, 5), { ratePercent: 5, taxableInr: 100, cgstInr: 2.5, sgstInr: 2.5, totalInr: 105 });
    const odd = gstBreakup(80, 5);
    assert.equal(odd.taxableInr, 76.19);
    assert.equal(Math.round((odd.taxableInr + odd.cgstInr + odd.sgstInr) * 100), 8000);
    assert.equal(gstBreakup(90, 0).cgstInr, 0);
  });

  it("checks GSTIN shape", () => {
    assert.equal(GSTIN_PATTERN.test("29ABCDE1234F1Z5"), true);
    assert.equal(GSTIN_PATTERN.test("29abcde1234f1z5"), false);
    assert.equal(GSTIN_PATTERN.test("29ABCDE1234F1Z"), false);
  });
});
