import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { brandAssetUrl, brandLogo, brandNames, logoFile } from "@/lib/brand";

const dir = mkdtempSync(path.join(tmpdir(), "brand-"));
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function file(name: string, contents: Buffer | string) {
  const full = path.join(dir, name);
  writeFileSync(full, contents);
  return full;
}

describe("brand names", () => {
  it("default to Campus Food Court, with Campus over Food Court in the header", () => {
    assert.deepEqual(brandNames({}), {
      name: "Campus Food Court",
      shortName: "Food Court",
      headerTop: "Campus",
      headerMain: "Food Court",
    });
  });

  it("split the header where the name ends with the short name", () => {
    assert.deepEqual(brandNames({ BRAND_NAME: "Acme Pune Food Court", BRAND_SHORT_NAME: "Food Court" }), {
      name: "Acme Pune Food Court",
      shortName: "Food Court",
      headerTop: "Acme Pune",
      headerMain: "Food Court",
    });
  });

  it("use the whole name on one line otherwise, and as the short name when there is none", () => {
    assert.deepEqual(brandNames({ BRAND_NAME: "Bitebox" }), {
      name: "Bitebox",
      shortName: "Bitebox",
      headerTop: null,
      headerMain: "Bitebox",
    });
    const odd = brandNames({ BRAND_NAME: "Food @ Acme", BRAND_SHORT_NAME: "Food" });
    assert.equal(odd.headerTop, null);
    assert.equal(odd.headerMain, "Food @ Acme");
    assert.equal(brandNames({ BRAND_NAME: "Acme Seafood Court", BRAND_SHORT_NAME: "Food Court" }).headerTop, null);
  });

  it("ignore blank values and control characters, and cap the length", () => {
    assert.equal(brandNames({ BRAND_NAME: "   ", BRAND_SHORT_NAME: "" }).name, "Campus Food Court");
    assert.equal(brandNames({ BRAND_NAME: "  Acme\u0007 Eats  " }).name, "Acme Eats");
    assert.equal(brandNames({ BRAND_NAME: "x".repeat(80) }).name.length, 60);
  });
});

describe("brand logo", () => {
  it("is the built-in SVG by default, with versioned URLs", () => {
    const logo = brandLogo({});
    assert.equal(logo.type, "image/svg+xml");
    assert.equal(logo.background, "#0b3d32");
    assert.match(logo.version, /^[0-9a-f]{12}$/);
    assert.equal(logoFile(logo), "logo.svg");
    assert.equal(brandAssetUrl(logo, "icon-192.png"), `/brand/icon-192.png?v=${logo.version}`);
  });

  it("takes a PNG, and changes version with the file and the background", () => {
    const first = brandLogo({ BRAND_LOGO: file("acme.png", Buffer.concat([PNG, Buffer.from("one")])) });
    assert.equal(first.type, "image/png");
    assert.equal(logoFile(first), "logo.png");
    assert.notEqual(first.version, brandLogo({}).version);
    const redrawn = brandLogo({ BRAND_LOGO: file("acme.png", Buffer.concat([PNG, Buffer.from("two!")])) });
    assert.notEqual(redrawn.version, first.version);
    const onWhite = brandLogo({ BRAND_LOGO: path.join(dir, "acme.png"), BRAND_LOGO_BACKGROUND: "#FFFFFF" });
    assert.equal(onWhite.background, "#FFFFFF");
    assert.notEqual(onWhite.version, redrawn.version);
  });

  it("falls back to the built-in logo, with a warning, when the file is unusable", (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    const unusable = [
      path.join(dir, "missing.svg"),
      file("logo.jpg", "jpeg"),
      file("fake.png", "<svg></svg>"),
      file("fake.svg", Buffer.concat([PNG, Buffer.from("png")])),
      file("huge.svg", `<svg>${" ".repeat(1024 * 1024)}</svg>`),
      dir,
    ];
    for (const logoPath of unusable) {
      assert.equal(brandLogo({ BRAND_LOGO: logoPath }).type, "image/svg+xml", logoPath);
    }
    assert.equal(warn.mock.callCount(), unusable.length);
    assert.match(String(warn.mock.calls[0].arguments[0]), /BRAND_LOGO=.*missing\.svg" was not found; using the built-in logo/);
  });

  it("refuses a background that is not a hex colour", (t) => {
    const warn = t.mock.method(console, "warn", () => {});
    assert.equal(brandLogo({ BRAND_LOGO_BACKGROUND: "green" }).background, "#0b3d32");
    assert.equal(brandLogo({ BRAND_LOGO_BACKGROUND: "#0b3d32ff" }).background, "#0b3d32");
    assert.equal(brandLogo({ BRAND_LOGO_BACKGROUND: "#fff" }).background, "#fff");
    assert.equal(warn.mock.callCount(), 2);
  });
});
