import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildQrPayload, verifyQrPayload } from "@/lib/qr";

// Read when signing, not at import.
process.env.SESSION_SECRET = "q".repeat(40);

describe("pickup QR", () => {
  it("verifies its own payload and rejects edits", async () => {
    const payload = await buildQrPayload("T-4821", "cmabcdefghij0123");
    assert.deepEqual(await verifyQrPayload(payload), { token: "T-4821", orderId: "cmabcdefghij0123" });
    assert.equal(await verifyQrPayload(payload.replace("T-4821", "T-4822")), null);
    assert.equal(await verifyQrPayload(payload.slice(0, -1) + "0"), null);
    assert.equal(await verifyQrPayload("FOOD-COURT|T-1|x|y"), null);
    assert.equal(await verifyQrPayload("nonsense"), null);
  });
});
