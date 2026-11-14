import assert from "node:assert/strict";
import test from "node:test";
import {
  clearReceiptDraft,
  readReceiptDraft,
  saveReceiptDraft,
} from "../../src/lib/receipt-draft.js";

const officeId = "019cb68c-a209-4c31-b7f0-d42f08162368";
const requestKey = "ac64c4e4-0d1b-4d47-9fc5-ec5f8f310b05";
const draft = {
  requestKey,
  itemId: "29ae7521-8c6a-4cc0-9185-ae72d2d65b26",
  locationId: "a0401204-e2b8-4e0b-8974-e078d02b1439",
  quantity: "12",
  reason: "opening",
  reference: "Initial pantry delivery",
};

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test("C06-AC7 a pending receipt draft survives reload with its request key and exact payload", () => {
  const storage = memoryStorage();
  assert.equal(saveReceiptDraft(storage, officeId, draft), true);
  assert.deepEqual(readReceiptDraft(storage, officeId), draft);
});

test("C06-AC7 draft storage is isolated by office", () => {
  const storage = memoryStorage();
  saveReceiptDraft(storage, officeId, draft);
  assert.equal(readReceiptDraft(storage, "92a507fb-6b98-40ad-9e31-7d1428ff0177"), null);
});

test("C06-AC7 malformed or mismatched drafts are ignored and removed", () => {
  const key = `office-management:receipt:${officeId}`;
  const storage = memoryStorage({ [key]: JSON.stringify({ ...draft, requestKey: "wrong" }) });
  assert.equal(readReceiptDraft(storage, officeId), null);
  assert.equal(storage.getItem(key), null);
});

test("C06-AC7 a confirmed receipt clears the pending retry draft", () => {
  const storage = memoryStorage();
  saveReceiptDraft(storage, officeId, draft);
  clearReceiptDraft(storage, officeId);
  assert.equal(readReceiptDraft(storage, officeId), null);
});
