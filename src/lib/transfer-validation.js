import { createHash } from "node:crypto";

const MAX_INTEGER = 2_147_483_647;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTENTS = new Set(["deployment", "return", "transfer"]);

function validationError(fieldErrors) {
  return Object.assign(new Error("Check the highlighted fields."), {
    code: "VALIDATION",
    fieldErrors,
  });
}

export function normalizeTransferInput(input = {}) {
  input = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const fieldErrors = {};
  const officeId = typeof input.officeId === "string" ? input.officeId.toLowerCase() : "";
  const sourceLocationId = typeof input.sourceLocationId === "string" ? input.sourceLocationId.toLowerCase() : "";
  const destinationLocationId = typeof input.destinationLocationId === "string" ? input.destinationLocationId.toLowerCase() : "";
  const itemId = typeof input.itemId === "string" ? input.itemId.toLowerCase() : "";
  const requestKey = typeof input.requestKey === "string" ? input.requestKey.toLowerCase() : "";
  for (const [field, value] of Object.entries({ officeId, sourceLocationId, destinationLocationId, itemId, requestKey })) {
    if (!UUID_PATTERN.test(value)) fieldErrors[field] = "Choose a valid resource.";
  }
  if (sourceLocationId && sourceLocationId === destinationLocationId) {
    fieldErrors.destinationLocationId = "Choose a different destination location.";
  }

  const quantity = typeof input.quantity === "number"
    ? input.quantity
    : typeof input.quantity === "string" && /^\d+$/.test(input.quantity)
      ? Number(input.quantity)
      : NaN;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_INTEGER) {
    fieldErrors.quantity = "Enter a whole quantity from 1 to 2,147,483,647.";
  }
  const intent = input.intent;
  if (!INTENTS.has(intent)) fieldErrors.intent = "Choose deployment, return, or transfer.";
  const rawReference = input.reference ?? "";
  const reference = typeof rawReference === "string" ? rawReference.trim() : "";
  if (typeof rawReference !== "string" || reference.length > 120) {
    fieldErrors.reference = "Use a reference of 120 characters or fewer.";
  }
  if (Object.keys(fieldErrors).length) throw validationError(fieldErrors);
  return {
    officeId,
    sourceLocationId,
    destinationLocationId,
    itemId,
    requestKey,
    quantity,
    intent,
    reference: reference || null,
  };
}

export function hashTransferInput(input) {
  const normalized = normalizeTransferInput(input);
  const payload = JSON.stringify({
    officeId: normalized.officeId,
    sourceLocationId: normalized.sourceLocationId,
    destinationLocationId: normalized.destinationLocationId,
    itemId: normalized.itemId,
    quantity: normalized.quantity,
    intent: normalized.intent,
    reference: normalized.reference,
  });
  return createHash("sha256").update(payload).digest("hex");
}
