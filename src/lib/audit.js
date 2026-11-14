import { randomUUID } from "node:crypto";

function auditError(code, message) {
  return Object.assign(new Error(message), { code });
}

function invalidAuditData() {
  return auditError(
    "AUDIT_DATA_INVALID",
    "Audit details contain invalid or sensitive data.",
  );
}

function validateSnapshot(value, { depth = 0, seen = new WeakSet() } = {}) {
  if (depth > 5) throw invalidAuditData();
  if (
    value === null ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return;
  }
  if (typeof value === "string") {
    if (value.length > 2048) throw invalidAuditData();
    return;
  }
  if (typeof value !== "object") throw invalidAuditData();
  if (seen.has(value)) throw invalidAuditData();
  seen.add(value);

  if (Array.isArray(value)) {
    if (value.length > 100) throw invalidAuditData();
    for (const item of value) validateSnapshot(item, { depth: depth + 1, seen });
    return;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw invalidAuditData();
  }
  const entries = Object.entries(value);
  if (entries.length > 64) throw invalidAuditData();
  for (const [key, nested] of entries) {
    if (
      key.length > 80 ||
      /(email|token|password|secret|credential|authorization|phone|session|cookie)/i.test(key)
    ) {
      throw invalidAuditData();
    }
    validateSnapshot(nested, { depth: depth + 1, seen });
  }
}

function snapshot(value) {
  if (value === undefined || value === null) return null;
  validateSnapshot(value);
  try {
    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, "utf8") > 8192) throw invalidAuditData();
    return JSON.parse(serialized);
  } catch (error) {
    if (error?.code === "AUDIT_DATA_INVALID") throw error;
    throw invalidAuditData();
  }
}

function safeIdentifier(value, pattern) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    pattern.test(value)
  );
}

export function buildAuditRecord(context, details = {}) {
  if (
    !context?.active ||
    !context.actorUserId ||
    !context.organizationId ||
    !context.membershipId
  ) {
    throw auditError("FORBIDDEN", "You do not have permission to perform this action.");
  }

  const {
    operation,
    resourceType,
    resourceId,
    officeId = null,
    requestId = randomUUID(),
  } = details;
  if (
    !safeIdentifier(operation, /^[a-z][a-z0-9_.-]*$/) ||
    !safeIdentifier(resourceType, /^[a-z][a-z0-9_-]*$/) ||
    !safeIdentifier(resourceId, /^[a-zA-Z0-9_.:-]+$/) ||
    !safeIdentifier(requestId, /^[a-zA-Z0-9_.:-]+$/) ||
    (officeId !== null && !context.officeIds?.includes(officeId))
  ) {
    if (officeId !== null && !context.officeIds?.includes(officeId)) {
      throw auditError("NOT_FOUND", "The requested resource was not found.");
    }
    throw invalidAuditData();
  }

  return {
    organizationId: context.organizationId,
    actorUserId: context.actorUserId,
    actorMembershipId: context.membershipId,
    officeId,
    operation,
    resourceType,
    resourceId,
    requestId,
    before: snapshot(details.before),
    after: snapshot(details.after),
  };
}
