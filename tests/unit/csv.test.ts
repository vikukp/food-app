import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvCell, csvRow } from "@/lib/csv";

describe("CSV export", () => {
  it("quotes commas, quotes and newlines", () => {
    assert.equal(csvRow(["a", "b,c", 'say "hi"', "two\nlines", 42, null]), 'a,"b,c","say ""hi""","two\nlines",42,');
  });

  it("defuses spreadsheet formulas in typed text", () => {
    assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
    assert.equal(csvCell("+91 98450"), "'+91 98450");
    assert.equal(csvCell("@sum"), "'@sum");
    assert.equal(csvCell(-5), "-5");
  });
});
