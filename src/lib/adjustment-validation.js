import { createHash } from "node:crypto";

const MAX_INTEGER = 2_147_483_647;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATIONS = new Set(["consumption", "damage", "count_correction"]);

function validationError(fieldErrors) {
  return Object.assign(new Error("Check the highlighted fields."), { code: "VALIDATION", fieldErrors });
}

function parseInteger(value, { minimum = 0, field, message, fieldErrors }) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > MAX_INTEGER) {
    fieldErrors[field] = message;
    return null;
  }
  return parsed;
}

export function normalizeStockAdjustment(input = {}) {
  input = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const fieldErrors = {};
  const fields = ["officeId", "locationId", "itemId", "requestKey"];
  const ids = Object.fromEntries(fields.map((field) => [field, typeof input[field] === "string" ? input[field].toLowerCase() : ""]));
  for (const field of fields) {
    if (!UUID_PATTERN.test(ids[field])) fieldErrors[field] = "Choose a valid resource.";
  }
  const operation = input.operation;
  if (!OPERATIONS.has(operation)) fieldErrors.operation = "Choose consumption, damage, or count correction.";

  let quantity = null;
  let countedQuantity = null;
  let expectedVersion = null;
  if (operation === "count_correction") {
    countedQuantity = parseInteger(input.countedQuantity, {
      field: "countedQuantity",
      message: "Enter a whole physical count from 0 to 2,147,483,647.",
      fieldErrors,
    });
    expectedVersion = parseInteger(input.expectedVersion, {
      field: "expectedVersion",
      message: "Reload the balance and count again before saving.",
      fieldErrors,
    });
  } else if (operation === "consumption" || operation === "damage") {
    quantity = parseInteger(input.quantity, {
      minimum: 1,
      field: "quantity",
      message: "Enter a whole quantity from 1 to 2,147,483,647.",
      fieldErrors,
    });
  }

  const rawReason = input.reason ?? "";
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  if (typeof rawReason !== "string" || !reason) fieldErrors.reason = "Enter a reason for this stock change.";
  else if (reason.length > 120) fieldErrors.reason = "Use 120 characters or fewer for the reason.";
  const rawReference = input.reference ?? "";
  const reference = typeof rawReference === "string" ? rawReference.trim() : "";
  if (typeof rawReference !== "string" || reference.length > 120) {
    fieldErrors.reference = "Use a reference of 120 characters or fewer.";
  }
  const rawReversalId = input.reversalOfMovementId ?? "";
  const reversalOfMovementId = typeof rawReversalId === "string" ? rawReversalId.toLowerCase() : "";
  if (reversalOfMovementId && !UUID_PATTERN.test(reversalOfMovementId)) {
    fieldErrors.reversalOfMovementId = "Choose a valid original movement.";
  }
  if (reversalOfMovementId && operation !== "count_correction") {
    fieldErrors.reversalOfMovementId = "Only a physical count correction can reverse a movement.";
  }
  if (Object.keys(fieldErrors).length) throw validationError(fieldErrors);
  return {
    ...ids,
    operation,
    quantity,
    countedQuantity,
    expectedVersion,
    reason,
    reference: reference || null,
    reversalOfMovementId: reversalOfMovementId || null,
  };
}

export function hashStockAdjustment(input) {
  const value = normalizeStockAdjustment(input);
  const payload = JSON.stringify({
    officeId: value.officeId,
    locationId: value.locationId,
    itemId: value.itemId,
    operation: value.operation,
    quantity: value.quantity,
    countedQuantity: value.countedQuantity,
    expectedVersion: value.expectedVersion,
    reason: value.reason,
    reference: value.reference,
    reversalOfMovementId: value.reversalOfMovementId,
  });
  return createHash("sha256").update(payload).digest("hex");
}
