import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeOfficeInput,
  normalizeRoomInput,
  parseListOptions,
} from "../../src/lib/office-validation.js";

test("C03-AC1 office input validation", async (t) => {
  await t.test("trims required fields, normalizes codes, and defaults timezone", () => {
    assert.deepEqual(
      normalizeOfficeInput({ name: "  Manila HQ ", code: " hq-1 " }),
      { name: "Manila HQ", code: "HQ-1", timezone: "UTC", address: null },
    );
  });

  await t.test("accepts a valid IANA timezone and a normalized address", () => {
    assert.deepEqual(
      normalizeOfficeInput({
        name: "Cebu",
        code: "cebu",
        timezone: "Asia/Manila",
        address: "  123 Main Street  ",
      }),
      { name: "Cebu", code: "CEBU", timezone: "Asia/Manila", address: "123 Main Street" },
    );
  });

  await t.test("rejects blank names, invalid codes, and unknown timezones by field", () => {
    for (const [input, field] of [
      [{ name: "  ", code: "HQ" }, "name"],
      [{ name: "HQ", code: "bad code" }, "code"],
      [{ name: "HQ", code: "HQ", timezone: "Mars/Olympus" }, "timezone"],
    ]) {
      assert.throws(
        () => normalizeOfficeInput(input),
        (error) => error.code === "VALIDATION" && field in error.fieldErrors,
      );
    }
  });

  await t.test("returns validation errors for malformed input containers", () => {
    assert.throws(() => normalizeOfficeInput(null), { code: "VALIDATION" });
    assert.throws(() => normalizeRoomInput([]), { code: "VALIDATION" });
  });
});

test("C03-AC2 room and collection input validation", async (t) => {
  await t.test("accepts nullable or nonnegative integer capacity and uppercase room code", () => {
    assert.deepEqual(
      normalizeRoomInput({ name: " Boardroom ", code: " br-1 ", capacity: 0 }),
      { name: "Boardroom", code: "BR-1", capacity: 0 },
    );
    assert.equal(normalizeRoomInput({ name: "Storage", code: "st", capacity: null }).capacity, null);
  });

  await t.test("rejects fractional, negative, nonnumeric, or oversized capacity", () => {
    for (const capacity of [-1, 1.5, "4", Number.MAX_SAFE_INTEGER + 1, NaN]) {
      assert.throws(
        () => normalizeRoomInput({ name: "Room", code: "R1", capacity }),
        (error) => error.code === "VALIDATION" && "capacity" in error.fieldErrors,
      );
    }
  });

  await t.test("bounds pagination and normalizes search", () => {
    assert.deepEqual(parseListOptions({ q: "  Manila ", page: "3", pageSize: "50" }), {
      query: "Manila",
      page: 3,
      pageSize: 50,
      offset: 100,
    });
    assert.throws(
      () => parseListOptions({ page: "0", pageSize: "1000" }),
      { code: "VALIDATION" },
    );
    assert.throws(() => parseListOptions({ page: Symbol("unsafe") }), { code: "VALIDATION" });
  });
});
