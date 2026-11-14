import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateRoomNeed,
  normalizeRoomNeedsQuery,
  normalizeRoomRequirementInput,
} from "../../src/lib/room-requirement-validation.js";

const officeId = "019cb68c-a209-4c31-b7f0-d42f08162368";
const roomId = "a0401204-e2b8-4e0b-8974-e078d02b1439";
const itemId = "29ae7521-8c6a-4cc0-9185-ae72d2d65b26";

test("C09-AC2/C09-AC3 calculates shortages, exact targets, surplus, and untracked stock", () => {
  assert.deepEqual(calculateRoomNeed(6, 3), { target: 6, deployed: 3, shortage: 3, surplus: 0, status: "shortage" });
  assert.deepEqual(calculateRoomNeed(6, 6), { target: 6, deployed: 6, shortage: 0, surplus: 0, status: "on_target" });
  assert.deepEqual(calculateRoomNeed(4, 6), { target: 4, deployed: 6, shortage: 0, surplus: 2, status: "surplus" });
  assert.deepEqual(calculateRoomNeed(0, 2), { target: 0, deployed: 2, shortage: 0, surplus: 2, status: "surplus" });
  assert.deepEqual(calculateRoomNeed(null, 2), { target: null, deployed: 2, shortage: 0, surplus: 2, status: "untracked" });
  assert.deepEqual(calculateRoomNeed(5, 0), { target: 5, deployed: 0, shortage: 5, surplus: 0, status: "shortage" });
});

test("C09-AC1 normalizes nonnegative room requirement targets and optimistic versions", () => {
  assert.deepEqual(normalizeRoomRequirementInput({
    officeId: officeId.toUpperCase(), roomId: roomId.toUpperCase(), itemId: itemId.toUpperCase(),
    targetQuantity: "6", expectedVersion: "0",
  }), { officeId, roomId, itemId, targetQuantity: 6, expectedVersion: 0 });
  assert.throws(() => normalizeRoomRequirementInput({
    officeId, roomId, itemId, targetQuantity: "-1", expectedVersion: 0,
  }), { code: "VALIDATION" });
  assert.throws(() => normalizeRoomRequirementInput({
    officeId, roomId, itemId, targetQuantity: "1.5", expectedVersion: 0,
  }), { code: "VALIDATION" });
  assert.throws(() => normalizeRoomRequirementInput({
    officeId, roomId, itemId, targetQuantity: "2147483648", expectedVersion: 0,
  }), { code: "VALIDATION" });
  assert.throws(() => normalizeRoomRequirementInput({
    officeId, roomId, itemId, targetQuantity: 1, expectedVersion: -1,
  }), { code: "VALIDATION" });
});

test("C09-AC5 normalizes bounded room need filters and validates status and identifiers", () => {
  assert.deepEqual(normalizeRoomNeedsQuery({ page: "2", pageSize: "25", status: "shortage", roomId, itemId, q: " tissues " }), {
    page: 2, pageSize: 25, offset: 25, status: "shortage", roomId, itemId, query: "tissues", officeId: null,
  });
  assert.deepEqual(normalizeRoomNeedsQuery({}), {
    page: 1, pageSize: 20, offset: 0, status: "all", roomId: null, itemId: null, query: "", officeId: null,
  });
  assert.throws(() => normalizeRoomNeedsQuery({ status: "shortage;drop table" }), { code: "VALIDATION" });
  assert.throws(() => normalizeRoomNeedsQuery({ roomId: "not-a-uuid" }), { code: "VALIDATION" });
  assert.throws(() => normalizeRoomNeedsQuery({ officeId: 0 }), { code: "VALIDATION" });
  assert.throws(() => normalizeRoomNeedsQuery({ page: "0" }), { code: "VALIDATION" });
  assert.throws(() => normalizeRoomNeedsQuery({ page: "100001" }), { code: "VALIDATION" });
});
