import "server-only";
import { auditEvents } from "../db/schema.js";
import { buildAuditRecord } from "./audit.js";

export async function recordAuditEvent(transaction, context, details) {
  const values = buildAuditRecord(context, details);
  const [record] = await transaction
    .insert(auditEvents)
    .values(values)
    .returning();
  return record;
}
