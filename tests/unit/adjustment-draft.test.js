import assert from "node:assert/strict";
import test from "node:test";
import { clearAdjustmentDraft, parseAdjustmentDraft, saveAdjustmentDraft } from "../../src/lib/adjustment-draft.js";

const officeId = "019cb68c-a209-4c31-b7f0-d42f08162368";
const draft = {
  requestKey: "ac64c4e4-0d1b-4d47-9fc5-ec5f8f310b05",
  locationId: "a0401204-e2b8-4e0b-8974-e078d02b1439",
  itemId: "29ae7521-8c6a-4cc0-9185-ae72d2d65b26",
  operation: "count_correction",
  quantity: "",
  countedQuantity: "0",
  expectedVersion: "4",
  reason: "Physical count",
  reference: "",
  reversalOfMovementId: "",
};

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("C08-AC5 pending correction preserves the request key and observed count version", () => {
  const store = storage();
  assert.equal(saveAdjustmentDraft(store, officeId, draft), true);
  assert.deepEqual(parseAdjustmentDraft(store.getItem("office-management:adjustment:" + officeId)), draft);
});

test("C08-AC3 invalid count drafts without an observed version are rejected", () => {
  const store = storage();
  assert.equal(saveAdjustmentDraft(store, officeId, { ...draft, expectedVersion: "" }), false);
  assert.equal(parseAdjustmentDraft("{broken"), null);
});

test("C08-AC5 resolution clears the pending correction", () => {
  const store = storage();
  saveAdjustmentDraft(store, officeId, draft);
  clearAdjustmentDraft(store, officeId);
  assert.equal(store.getItem("office-management:adjustment:" + officeId), null);
});
