import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPhone, maskPhone, normalizeIndianMobile } from "@/lib/phone";
import { hashPin, isWeakPin, verifyPin } from "@/lib/pin";
import { parseEmployeeClaims } from "@/lib/session-claims";
import { signToken, verifyToken } from "@/lib/signed-token";
import { cleanText, toInt } from "@/lib/validation";
import { clientAddress } from "../../scripts/client-address.mjs";

const SECRET = "x".repeat(40);

describe("phone numbers", () => {
  it("accepts Indian mobiles in common spellings", () => {
    for (const raw of ["9845012345", "+91 98450 12345", "0091 9845012345", "09845012345"]) {
      assert.equal(normalizeIndianMobile(raw), "+919845012345", raw);
    }
  });

  it("refuses landlines, short numbers and other countries", () => {
    for (const raw of ["5845012345", "984501234", "+1 415 555 0100", "", null, "98450123456789012345678"]) {
      assert.equal(normalizeIndianMobile(raw), null, String(raw));
    }
  });

  it("formats and masks", () => {
    assert.equal(formatPhone("+919845012345"), "+91 98450 12345");
    assert.equal(maskPhone("+919845012345"), "+91 98••• ••345");
  });
});

describe("PINs", () => {
  it("hash with a salt and verify", () => {
    const a = hashPin("5937");
    assert.notEqual(a, hashPin("5937"));
    assert.equal(verifyPin("5937", a), true);
    assert.equal(verifyPin("5938", a), false);
    assert.equal(verifyPin("5937", "garbage"), false);
  });

  it("refuse easy PINs", () => {
    for (const pin of ["1111", "1234", "4321", "9012", "2580", "123123"]) assert.equal(isWeakPin(pin), true, pin);
    for (const pin of ["5937", "4826", "731905"]) assert.equal(isWeakPin(pin), false, pin);
  });
});

describe("signed tokens", () => {
  it("round-trip and carry an expiry", async () => {
    const token = await signToken({ kind: "vendor", stallId: "momos", sv: 2 }, SECRET, 60);
    const claims = await verifyToken<{ stallId: string }>(token, SECRET);
    assert.equal(claims?.stallId, "momos");
    assert.ok(claims!.exp > Date.now() / 1000);
  });

  it("reject a wrong secret, an edited body and an expired token", async () => {
    const token = await signToken({ kind: "vendor", stallId: "momos" }, SECRET, 60);
    assert.equal(await verifyToken(token, "y".repeat(40)), null);
    const [body, sig] = token.split(".");
    const edited = Buffer.from(JSON.stringify({ kind: "vendor", stallId: "dosa", exp: 9e9 })).toString("base64url");
    assert.equal(await verifyToken(`${edited}.${sig}`, SECRET), null);
    assert.equal(await verifyToken(`${body}x.${sig}`, SECRET), null);
    assert.equal(await verifyToken(await signToken({}, SECRET, -5), SECRET), null);
    assert.equal(await verifyToken(undefined, SECRET), null);
    assert.equal(await verifyToken("no-dot", SECRET), null);
  });

  it("parse employee claims strictly", () => {
    const good = { kind: "employee", uid: "abc", sv: 0, auth: "otp", authAt: 1 };
    assert.deepEqual(parseEmployeeClaims(good), good);
    assert.equal(parseEmployeeClaims({ ...good, kind: "vendor" }), null);
    assert.equal(parseEmployeeClaims({ ...good, sv: "0" }), null);
    assert.equal(parseEmployeeClaims({ ...good, auth: "sso" }), null);
    assert.equal(parseEmployeeClaims(null), null);
  });
});

describe("input cleaning", () => {
  it("strips control characters, trims and caps length", () => {
    assert.equal(cleanText("  a\u0000b\nc  ", 10), "abc");
    assert.equal(cleanText("abcdef", 3), "abc");
    assert.equal(cleanText(undefined, 3), "");
    assert.equal(toInt("12"), 12);
    assert.equal(toInt("1.5"), null);
    assert.equal(toInt("x"), null);
  });
});

describe("client address", () => {
  it("ignores X-Forwarded-For when no proxy is trusted", () => {
    assert.equal(clientAddress("203.0.113.9", "10.0.0.5", 0), "10.0.0.5");
    assert.equal(clientAddress(undefined, "10.0.0.5", 0), "10.0.0.5");
  });

  it("takes the address the trusted proxy saw, not what the client typed", () => {
    // client typed 1.1.1.1; proxy appended the real client 198.51.100.7
    assert.equal(clientAddress("1.1.1.1, 198.51.100.7", "10.0.0.2", 1), "198.51.100.7");
    assert.equal(clientAddress("198.51.100.7, 10.0.0.3", "10.0.0.2", 2), "198.51.100.7");
    // more hops trusted than present: fall back to the leftmost
    assert.equal(clientAddress("198.51.100.7", "10.0.0.2", 5), "198.51.100.7");
  });
});
