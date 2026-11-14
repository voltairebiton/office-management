import { createHash } from "node:crypto";

const MAX_INTEGER = 2_147_483_647;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validationError(fieldErrors) {
  return Object.assign(new Error("Check the highlighted fields."), {
    code: "VALIDATION",
    fieldErrors,
  });
}

function inputRecord(input) {
  return input && typeof input === "object" && !Array.isArray(input) ? input : {};
}

export function normalizeReceiptInput(input = {}) {
  input = inputRecord(input);
  const fieldErrors = {};
  const itemId = typeof input.itemId === "string" ? input.itemId : "";
  const officeId = typeof input.officeId === "string" ? input.officeId : "";
  const locationId = typeof input.locationId === "string" ? input.locationId : "";
  const requestKey = typeof input.requestKey === "string" ? input.requestKey : "";
  if (!UUID_PATTERN.test(itemId)) fieldErrors.itemId = "Choose a valid catalog item.";
  if (!UUID_PATTERN.test(officeId)) fieldErrors.officeId = "Choose a valid office.";
  if (!UUID_PATTERN.test(locationId)) fieldErrors.locationId = "Choose a valid stock location.";
  if (!UUID_PATTERN.test(requestKey)) fieldErrors.requestKey = "Reload this form to get a safe retry key.";

  const quantity = typeof input.quantity === "number"
    ? input.quantity
    : typeof input.quantity === "string" && /^\d+$/.test(input.quantity)
      ? Number(input.quantity)
      : NaN;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_INTEGER) {
    fieldErrors.quantity = "Enter a whole quantity from 1 to 2,147,483,647.";
  }

  const reason = input.reason;
  if (!new Set(["opening", "replenishment"]).has(reason)) {
    fieldErrors.reason = "Choose opening stock or replenishment.";
  }
  const rawReference = input.reference ?? "";
  const reference = typeof rawReference === "string" ? rawReference.trim() : "";
  if (typeof rawReference !== "string" || reference.length > 120) {
    fieldErrors.reference = "Use a reference of 120 characters or fewer.";
  }
  if (Object.keys(fieldErrors).length) throw validationError(fieldErrors);
  return { itemId, officeId, locationId, requestKey, quantity, reason, reference: reference || null };
}

export function hashReceiptInput(input) {
  const normalized = normalizeReceiptInput(input);
  const canonicalPayload = JSON.stringify({
    itemId: normalized.itemId,
    officeId: normalized.officeId,
    locationId: normalized.locationId,
    quantity: normalized.quantity,
    reason: normalized.reason,
    reference: normalized.reference,
  });
  return createHash("sha256").update(canonicalPayload).digest("hex");
}
