import assert from "node:assert/strict";
import test from "node:test";
import { hashReceiptInput, normalizeReceiptInput } from "../../src/lib/ledger-validation.js";

const itemId = "29ae7521-8c6a-4cc0-9185-ae72d2d65b26";
const officeId = "019cb68c-a209-4c31-b7f0-d42f08162368";
const locationId = "a0401204-e2b8-4e0b-8974-e078d02b1439";
const requestKey = "ac64c4e4-0d1b-4d47-9fc5-ec5f8f310b05";

test("C06-AC1 receipt input validation", async (t) => {
  await t.test("normalizes a positive whole-unit opening receipt", () => {
    assert.deepEqual(normalizeReceiptInput({
      itemId,
      officeId,
      locationId,
      requestKey,
      quantity: "12",
      reason: "opening",
      reference: "  Initial pantry delivery  ",
    }), {
      itemId,
      officeId,
      locationId,
      requestKey,
      quantity: 12,
      reason: "opening",
      reference: "Initial pantry delivery",
    });
  });

  await t.test("supports replenishment and an optional reference", () => {
    assert.deepEqual(normalizeReceiptInput({
      itemId,
      officeId,
      locationId,
      requestKey,
      quantity: 1,
      reason: "replenishment",
    }), {
      itemId,
      officeId,
      locationId,
      requestKey,
      quantity: 1,
      reason: "replenishment",
      reference: null,
    });
  });

  await t.test("rejects zero, negative, fractional, ambiguous, oversized, and malformed inputs", () => {
    const base = { itemId, officeId, locationId, requestKey, quantity: 1, reason: "opening" };
    for (const quantity of [0, -1, 1.5, "1.5", "1e2", "1,000", "2147483648", ""]) {
      assert.throws(() => normalizeReceiptInput({ ...base, quantity }), { code: "VALIDATION" });
    }
    for (const input of [
      { ...base, itemId: "foreign-item" },
      { ...base, locationId: "not-a-location" },
      { ...base, requestKey: "not-a-request-id" },
      { ...base, reason: "purchase-order" },
      { ...base, reference: "r".repeat(241) },
    ]) {
      assert.throws(() => normalizeReceiptInput(input), { code: "VALIDATION" });
    }
  });
});

test("C06-AC4 receipt idempotency fingerprints", () => {
  const normalized = normalizeReceiptInput({
    itemId,
    officeId,
    locationId,
    requestKey,
    quantity: "12",
    reason: "opening",
    reference: "Initial delivery",
  });
  const repeated = normalizeReceiptInput({
    itemId,
    officeId,
    locationId,
    requestKey,
    quantity: 12,
    reason: "opening",
    reference: "  Initial delivery  ",
  });
  assert.equal(hashReceiptInput(normalized), hashReceiptInput(repeated));
  assert.notEqual(hashReceiptInput(normalized), hashReceiptInput({ ...normalized, quantity: 13 }));
  assert.notEqual(hashReceiptInput(normalized), hashReceiptInput({ ...normalized, reason: "replenishment" }));
});
