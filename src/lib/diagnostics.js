import { randomUUID } from "node:crypto";

const REQUEST_REFERENCE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const expectedOutcomes = new Set([
  "VALIDATION",
  "CONFLICT",
  "NOT_FOUND",
  "FORBIDDEN",
  "INSUFFICIENT_STOCK",
  "UNAUTHENTICATED",
  "IDENTITY_ORGANIZATION_REQUIRED",
  "IDENTITY_MEMBERSHIP_MISMATCH",
  "IDENTITY_MEMBERSHIP_NOT_FOUND",
  "IDENTITY_ORGANIZATION_INACTIVE",
  "IDENTITY_REQUEST_INVALID",
  "WEBHOOK_SIGNATURE_INVALID",
  "IDENTITY_WEBHOOK_INVALID",
]);
const dependencyOutcomes = new Set([
  "DEPENDENCY_UNAVAILABLE",
  "IDENTITY_PROVIDER_NOT_CONFIGURED",
  "IDENTITY_PROVIDER_UNAVAILABLE",
  "IDENTITY_SYNC_UNAVAILABLE",
  "WEBHOOK_NOT_CONFIGURED",
]);

export function isSafeRequestReference(value) {
  return typeof value === "string" && REQUEST_REFERENCE_PATTERN.test(value);
}

export function reportOperationFailure(operation, error, {
  logger = console.error,
  createId = randomUUID,
} = {}) {
  if (expectedOutcomes.has(error?.code)) return null;
  const requestId = createId();
  const operationName = typeof operation === "string" && /^[a-z][a-z0-9.-]{0,63}$/.test(operation)
    ? operation
    : "workspace.operation";
  const code = dependencyOutcomes.has(error?.code) ? "DEPENDENCY_UNAVAILABLE" : "INTERNAL_ERROR";
  try {
    logger("Workspace operation failed", { requestId, operation: operationName, code });
  } catch {
    // Diagnostics must never replace the operation's safe user-facing result.
  }
  return requestId;
}
