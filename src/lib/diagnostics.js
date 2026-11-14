import { randomUUID } from "node:crypto";

const expectedOutcomes = new Set([
  "VALIDATION",
  "CONFLICT",
  "NOT_FOUND",
  "FORBIDDEN",
  "INSUFFICIENT_STOCK",
]);
const dependencyOutcomes = new Set([
  "DEPENDENCY_UNAVAILABLE",
  "IDENTITY_PROVIDER_NOT_CONFIGURED",
  "IDENTITY_PROVIDER_UNAVAILABLE",
]);

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
