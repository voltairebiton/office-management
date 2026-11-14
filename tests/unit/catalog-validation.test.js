import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCatalogItemInput,
  normalizeStorageLocationInput,
} from "../../src/lib/catalog-validation.js";

test("C05-AC2 catalog item normalization", async (t) => {
  await t.test("trims names, uppercases SKUs, and stores one normalized base-unit label", () => {
    assert.deepEqual(normalizeCatalogItemInput({
      sku: "  tissue-box_1 ",
      name: "  Facial tissues  ",
      category: "consumable",
      unit: " Box ",
    }), {
      sku: "TISSUE-BOX_1",
      name: "Facial tissues",
      category: "consumable",
      unit: "box",
    });
  });

  await t.test("accepts reusable inventory and unit labels without conversion", () => {
    assert.deepEqual(normalizeCatalogItemInput({
      sku: "CHAIR-01",
      name: "Desk chair",
      category: "reusable",
      unit: "Piece",
    }), {
      sku: "CHAIR-01",
      name: "Desk chair",
      category: "reusable",
      unit: "piece",
    });
  });

  await t.test("rejects missing fields, invalid SKUs, categories, and multiword units", () => {
    for (const input of [
      { sku: "", name: "Tissues", category: "consumable", unit: "box" },
      { sku: "good sku", name: "Tissues", category: "consumable", unit: "box" },
      { sku: "SKU-1", name: " ", category: "consumable", unit: "box" },
      { sku: "SKU-1", name: "Tissues", category: "food", unit: "box" },
      { sku: "SKU-1", name: "Tissues", category: "consumable", unit: "box of 10" },
      { sku: "SKU-1", name: "Tissues", category: "consumable", unit: "" },
    ]) {
      assert.throws(() => normalizeCatalogItemInput(input), { code: "VALIDATION" });
    }
  });
});

test("C05-AC3 storage location normalization", async (t) => {
  await t.test("normalizes the office location code and trims its name", () => {
    assert.deepEqual(normalizeStorageLocationInput({ code: "  pantry_1 ", name: "  Pantry  " }), {
      code: "PANTRY_1",
      name: "Pantry",
    });
  });

  await t.test("rejects malformed location codes and blank or oversized names", () => {
    for (const input of [
      { code: "room 1", name: "Pantry" },
      { code: "PANTRY", name: "  " },
      { code: "PANTRY", name: "x".repeat(121) },
    ]) {
      assert.throws(() => normalizeStorageLocationInput(input), { code: "VALIDATION" });
    }
  });
});
