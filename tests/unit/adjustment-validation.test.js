import assert from "node:assert/strict";
import test from "node:test";
import { hashStockAdjustment, normalizeStockAdjustment } from "../../src/lib/adjustment-validation.js";

const base = {
  officeId: "019cb68c-a209-4c31-b7f0-d42f08162368",
  locationId: "a0401204-e2b8-4e0b-8974-e078d02b1439",
  itemId: "29ae7521-8c6a-4cc0-9185-ae72d2d65b26",
  requestKey: "ac64c4e4-0d1b-4d47-9fc5-ec5f8f310b05",
};

test("C08-AC1/C08-AC2 adjustment validation", async (t) => {
  await t.test("normalizes a reasoned consumption reduction", () => {
    assert.deepEqual(normalizeStockAdjustment({
      ...base, operation: "consumption", quantity: "3", reason: "  Used for visitor meeting  ",
    }), {
      ...base, operation: "consumption", quantity: 3, countedQuantity: null, expectedVersion: null,
      reason: "Used for visitor meeting", reference: null, reversalOfMovementId: null,
    });
  });

  await t.test("supports a zero-count confirmation with its observed version", () => {
    assert.deepEqual(normalizeStockAdjustment({
      ...base, operation: "count_correction", countedQuantity: "0", expectedVersion: "4", reason: "  Physical count  ",
    }), {
      ...base, operation: "count_correction", quantity: null, countedQuantity: 0, expectedVersion: 4,
      reason: "Physical count", reference: null, reversalOfMovementId: null,
    });
  });

  await t.test("rejects blank reasons, stale-version input shapes, and invalid amounts", () => {
    for (const input of [
      { ...base, operation: "consumption", quantity: 0, reason: "Used" },
      { ...base, operation: "damage", quantity: "2147483648", reason: "Damaged" },
      { ...base, operation: "count_correction", countedQuantity: -1, expectedVersion: 1, reason: "Count" },
      { ...base, operation: "count_correction", countedQuantity: 4, expectedVersion: -1, reason: "Count" },
      { ...base, operation: "count_correction", countedQuantity: 4, expectedVersion: "1.5", reason: "Count" },
      { ...base, operation: "consumption", quantity: 1, reason: "  " },
      { ...base, operation: "unknown", quantity: 1, reason: "Other" },
      { ...base, operation: "damage", quantity: 1, reason: "Damaged", reversalOfMovementId: "bad" },
    ]) {
      assert.throws(() => normalizeStockAdjustment(input), { code: "VALIDATION" });
    }
  });
});

test("C08-AC5 request fingerprints include operation, counted version, reason, and reversal target", () => {
  const original = normalizeStockAdjustment({
    ...base, operation: "count_correction", countedQuantity: 4, expectedVersion: 2, reason: "Cycle count",
  });
  assert.equal(hashStockAdjustment(original), hashStockAdjustment({
    ...original, countedQuantity: "4", expectedVersion: "2", reason: " Cycle count ",
  }));
  assert.notEqual(hashStockAdjustment(original), hashStockAdjustment({ ...original, expectedVersion: 3 }));
  assert.notEqual(hashStockAdjustment(original), hashStockAdjustment({ ...original, countedQuantity: 3 }));
});
