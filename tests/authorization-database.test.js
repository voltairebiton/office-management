import "../scripts/env.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import test from "node:test";
import { createDatabase } from "../src/db/connection.js";
import {
  officeAssignments,
  offices,
  organizationMemberships,
  organizations,
  users,
} from "../src/db/schema.js";
import { loadAuthorizationContext } from "../src/lib/authorization-context.js";
import { assertCapability } from "../src/lib/authorization.js";
import { resolveTestDatabaseUrl } from "../scripts/test-database-config.js";

test("C02-AC1/C02-AC3 Postgres authorization context is tenant and office scoped", async () => {
  const testDatabaseUrl = resolveTestDatabaseUrl({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    directDatabaseUrl: process.env.DIRECT_DATABASE_URL,
  });
  const { db, pool } = createDatabase(testDatabaseUrl);
  const suffix = randomUUID();
  const rollbackFixture = new Error("ROLLBACK_AUTHORIZATION_FIXTURE");

  try {
    await assert.rejects(
      db.transaction(async (transaction) => {
        const [organization] = await transaction
          .insert(organizations)
          .values({ workosOrganizationId: `org_${suffix}`, name: "Access test" })
          .returning();
        const [managerUser] = await transaction
          .insert(users)
          .values({ workosUserId: `user_manager_${suffix}`, email: `${suffix}@example.invalid` })
          .returning();
        const [adminUser] = await transaction
          .insert(users)
          .values({ workosUserId: `user_admin_${suffix}`, email: `admin_${suffix}@example.invalid` })
          .returning();
        const [manager] = await transaction
          .insert(organizationMemberships)
          .values({
            organizationId: organization.id,
            userId: managerUser.id,
            workosMembershipId: `member_manager_${suffix}`,
            status: "active",
            role: "office_manager",
          })
          .returning();
        const [admin] = await transaction
          .insert(organizationMemberships)
          .values({
            organizationId: organization.id,
            userId: adminUser.id,
            workosMembershipId: `member_admin_${suffix}`,
            status: "active",
            role: "organization_admin",
          })
          .returning();
        const [officeA, officeB] = await transaction
          .insert(offices)
          .values([
            { organizationId: organization.id, name: "North office", code: `N-${suffix}` },
            { organizationId: organization.id, name: "South office", code: `S-${suffix}` },
          ])
          .returning();
        await transaction.insert(officeAssignments).values({
          organizationId: organization.id,
          officeId: officeA.id,
          membershipId: manager.id,
          isActive: true,
        });

        const managerContext = await loadAuthorizationContext({
          actorUserId: managerUser.id,
          organizationId: organization.id,
          membershipId: manager.id,
          database: transaction,
        });
        const adminContext = await loadAuthorizationContext({
          actorUserId: adminUser.id,
          organizationId: organization.id,
          membershipId: admin.id,
          database: transaction,
        });
        assert.deepEqual(managerContext.officeIds, [officeA.id]);
        assert.deepEqual(new Set(adminContext.officeIds), new Set([officeA.id, officeB.id]));
        assert.equal(managerContext.capabilities.includes("office-access:manage"), false);
        assert.equal(adminContext.capabilities.includes("office-access:manage"), true);

        assert.throws(
          () => assertCapability(managerContext, "rooms:manage", {
            organizationId: organization.id,
            officeId: officeB.id,
          }),
          { code: "NOT_FOUND", message: "The requested resource was not found." },
        );
        assert.throws(
          () => assertCapability(managerContext, "rooms:manage", {
            organizationId: `foreign_${suffix}`,
            officeId: officeA.id,
          }),
          { code: "NOT_FOUND", message: "The requested resource was not found." },
        );

        await transaction
          .update(organizationMemberships)
          .set({ status: "inactive" })
          .where(eq(organizationMemberships.id, manager.id));
        const inactiveContext = await loadAuthorizationContext({
          actorUserId: managerUser.id,
          organizationId: organization.id,
          membershipId: manager.id,
          database: transaction,
        });
        assert.equal(inactiveContext.active, false);
        assert.deepEqual(inactiveContext.capabilities, []);
        throw rollbackFixture;
      }),
      (error) => error === rollbackFixture,
    );
  } finally {
    await pool.end();
  }
});
