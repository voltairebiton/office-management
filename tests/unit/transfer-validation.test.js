import assert from "node:assert/strict";
import test from "node:test";
import { hashTransferInput, normalizeTransferInput } from "../../src/lib/transfer-validation.js";

const base = {
  officeId: "019cb68c-a209-4c31-b7f0-d42f08162368",
  sourceLocationId: "a0401204-e2b8-4e0b-8974-e078d02b1439",
  destinationLocationId: "92a507fb-6b98-40ad-9e31-7d1428ff0177",
  itemId: "29ae7521-8c6a-4cc0-9185-ae72d2d65b26",
  requestKey: "ac64c4e4-0d1b-4d47-9fc5-ec5f8f310b05",
  quantity: "12",
  intent: "deployment",
  reference: "  Move to room 101  ",
};

test("C07-AC1 transfer input validation", async (t) => {
  await t.test("normalizes a positive whole-unit deployment", () => {
    const normalized = normalizeTransferInput(base);
    assert.deepEqual(normalized, {
      ...base,
      quantity: 12,
      reference: "Move to room 101",
    });
    assert.deepEqual(normalizeTransferInput({ ...base, sourceLocationId: base.sourceLocationId.toUpperCase() }), normalized);
  });

  await t.test("rejects invalid amounts, locations, intent, and oversized references", () => {
    for (const input of [
      { ...base, quantity: 0 },
      { ...base, quantity: "1.5" },
      { ...base, quantity: "2147483648" },
      { ...base, destinationLocationId: base.sourceLocationId },
      { ...base, sourceLocationId: "bad" },
      { ...base, intent: "consumption" },
      { ...base, reference: "x".repeat(121) },
    ]) {
      assert.throws(() => normalizeTransferInput(input), { code: "VALIDATION" });
    }
  });
});

test("C07-AC5 transfer fingerprints use normalized input and distinguish route or intent", () => {
  const normalized = normalizeTransferInput(base);
  const equivalent = normalizeTransferInput({ ...base, quantity: 12, reference: "Move to room 101" });
  assert.equal(hashTransferInput(normalized), hashTransferInput(equivalent));
  assert.notEqual(hashTransferInput(normalized), hashTransferInput({ ...normalized, destinationLocationId: "11111111-1111-4111-8111-111111111111" }));
  assert.notEqual(hashTransferInput(normalized), hashTransferInput({ ...normalized, intent: "return" }));
});
