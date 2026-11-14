import "../scripts/env.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import test from "node:test";
import { buildAuthorizationContext } from "../src/lib/authorization.js";
import { recordAuditEvent } from "../src/lib/audit-repository.js";
import { createDatabase } from "../src/db/connection.js";
import {
  auditEvents,
  offices,
  organizationMemberships,
  organizations,
  users,
} from "../src/db/schema.js";
import { resolveTestDatabaseUrl } from "../scripts/test-database-config.js";

test("C02-AC7 audit rows are transactionally scoped and immutable in Postgres", async () => {
  const testDatabaseUrl = resolveTestDatabaseUrl({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    directDatabaseUrl: process.env.DIRECT_DATABASE_URL,
  });
  const { db, pool } = createDatabase(testDatabaseUrl);
  const suffix = randomUUID();
  const rollbackFixture = new Error("ROLLBACK_AUDIT_FIXTURE");

  try {
    await assert.rejects(
      db.transaction(async (transaction) => {
        const [organization] = await transaction
          .insert(organizations)
          .values({ workosOrganizationId: `org_${suffix}`, name: "Audit test" })
          .returning();
        const [user] = await transaction
          .insert(users)
          .values({ workosUserId: `user_${suffix}`, email: `${suffix}@example.invalid` })
          .returning();
        const [membership] = await transaction
          .insert(organizationMemberships)
          .values({
            organizationId: organization.id,
            userId: user.id,
            workosMembershipId: `membership_${suffix}`,
            role: "organization_admin",
            status: "active",
          })
          .returning();
        const [office] = await transaction
          .insert(offices)
          .values({ organizationId: organization.id, name: "Audit office", code: `A-${suffix}` })
          .returning();
        const context = buildAuthorizationContext({
          actor: { id: user.id },
          organization,
          membership,
          offices: [office],
        });
        const audit = await recordAuditEvent(transaction, context, {
          operation: "office.updated",
          resourceType: "office",
          resourceId: office.id,
          officeId: office.id,
          requestId: `request_${suffix}`,
          before: { name: "Audit office", code: `A-${suffix}` },
          after: { name: "Audit office west", code: `A-${suffix}` },
        });

        await transaction.execute(sql.raw("SAVEPOINT audit_update"));
        await assert.rejects(
          transaction
            .update(auditEvents)
            .set({ operation: "office.deleted" })
            .where(eq(auditEvents.id, audit.id)),
          (error) => error.code === "55000",
        );
        await transaction.execute(sql.raw("ROLLBACK TO SAVEPOINT audit_update"));
        await transaction.execute(sql.raw("RELEASE SAVEPOINT audit_update"));

        await transaction.execute(sql.raw("SAVEPOINT audit_delete"));
        await assert.rejects(
          transaction.delete(auditEvents).where(eq(auditEvents.id, audit.id)),
          (error) => error.code === "55000",
        );
        await transaction.execute(sql.raw("ROLLBACK TO SAVEPOINT audit_delete"));
        await transaction.execute(sql.raw("RELEASE SAVEPOINT audit_delete"));

        await transaction.execute(sql.raw("SAVEPOINT audit_truncate"));
        await assert.rejects(
          transaction.execute(sql.raw("TRUNCATE audit_events")),
          (error) => error.code === "55000",
        );
        await transaction.execute(sql.raw("ROLLBACK TO SAVEPOINT audit_truncate"));
        await transaction.execute(sql.raw("RELEASE SAVEPOINT audit_truncate"));

        const [stored] = await transaction
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.id, audit.id));
        assert.equal(stored.operation, "office.updated");
        assert.deepEqual(stored.after, { name: "Audit office west", code: `A-${suffix}` });
        throw rollbackFixture;
      }),
      (error) => error === rollbackFixture,
    );
  } finally {
    await pool.end();
  }
});
