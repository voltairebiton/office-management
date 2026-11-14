import assert from "node:assert/strict";
import test from "node:test";
import { clearTransferDraft, parseTransferDraft, saveTransferDraft } from "../../src/lib/transfer-draft.js";

const officeId = "019cb68c-a209-4c31-b7f0-d42f08162368";
const draft = {
  requestKey: "ac64c4e4-0d1b-4d47-9fc5-ec5f8f310b05",
  sourceLocationId: "a0401204-e2b8-4e0b-8974-e078d02b1439",
  destinationLocationId: "92a507fb-6b98-40ad-9e31-7d1428ff0177",
  itemId: "29ae7521-8c6a-4cc0-9185-ae72d2d65b26",
  quantity: "6",
  intent: "deployment",
  reference: "Meeting room setup",
};

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("C07-AC5/C07-AC7 pending transfer retry restores the exact payload and key", () => {
  const store = storage();
  assert.equal(saveTransferDraft(store, officeId, draft), true);
  assert.deepEqual(parseTransferDraft(store.getItem(`office-management:transfer:${officeId}`)), draft);
});

test("C07-AC5/C07-AC7 rejects invalid or same-location drafts and clears after resolution", () => {
  const store = storage();
  assert.equal(saveTransferDraft(store, officeId, { ...draft, destinationLocationId: draft.sourceLocationId }), false);
  assert.equal(saveTransferDraft(store, officeId, draft), true);
  clearTransferDraft(store, officeId);
  assert.equal(store.getItem(`office-management:transfer:${officeId}`), null);
});
