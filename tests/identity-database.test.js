import "../scripts/env.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import test from "node:test";
import { createDatabase } from "../src/db/connection.js";
import { organizationMemberships, organizations, users } from "../src/db/schema.js";
import { createDrizzleIdentityRepository } from "../src/lib/identity-repository.js";
import { syncIdentityFromSession } from "../src/lib/identity-sync.js";
import { processWorkOSMembershipEvent } from "../src/lib/identity-webhook.js";
import { resolveTestDatabaseUrl } from "../scripts/test-database-config.js";

test("C01 Postgres identity synchronization is atomic and idempotent", async () => {
  const testDatabaseUrl = resolveTestDatabaseUrl({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    directDatabaseUrl: process.env.DIRECT_DATABASE_URL,
  });
  const { db, pool } = createDatabase(testDatabaseUrl);
  const suffix = randomUUID();
  const first = {
    user: {
      workosUserId: `user_${suffix}`,
      email: `${suffix}@example.invalid`,
      displayName: "Ada Lovelace",
    },
    organization: {
      workosOrganizationId: `org_${suffix}`,
      name: "Identity test organization",
    },
    membership: {
      workosMembershipId: `membership_${suffix}`,
      status: "active",
      role: null,
    },
  };
  const second = {
    user: {
      workosUserId: `user_other_${suffix}`,
      email: `other_${suffix}@example.invalid`,
      displayName: "Grace Hopper",
    },
    organization: {
      workosOrganizationId: `org_other_${suffix}`,
      name: "Other identity test organization",
    },
    membership: {
      ...first.membership,
      workosMembershipId: first.membership.workosMembershipId,
    },
  };
  const transactionRollback = new Error("ROLLBACK_IDENTITY_FIXTURE");

  try {
    await assert.rejects(
      db.transaction(async (outerTransaction) => {
        const repository = createDrizzleIdentityRepository(outerTransaction);
        const session = {
          user: { id: first.user.workosUserId },
          organizationId: first.organization.workosOrganizationId,
        };
        const provider = { loadActiveIdentity: async () => first };
        const initial = await syncIdentityFromSession({
          session,
          provider,
          repository,
        });
        await outerTransaction
          .update(organizationMemberships)
          .set({ role: "organization_admin" })
          .where(eq(organizationMemberships.id, initial.membership.id));
        const retried = await syncIdentityFromSession({
          session,
          provider,
          repository,
        });
        assert.equal(retried.user.id, initial.user.id);
        assert.equal(retried.organization.id, initial.organization.id);
        assert.equal(retried.membership.id, initial.membership.id);
        assert.equal(retried.membership.role, "organization_admin");
        assert.equal(retried.membership.status, "active");

        const membershipEvent = {
          id: `event_${suffix}`,
          event: "organization_membership.created",
          createdAt: new Date().toISOString(),
          data: {
            id: first.membership.workosMembershipId,
            userId: first.user.workosUserId,
            organizationId: first.organization.workosOrganizationId,
          },
        };
        const eventResult = await processWorkOSMembershipEvent({
          provider,
          repository,
          event: membershipEvent,
        });
        const duplicateResult = await processWorkOSMembershipEvent({
          provider,
          repository,
          event: membershipEvent,
        });
        assert.equal(eventResult.processed, true);
        assert.equal(duplicateResult.duplicate, true);

        const delayedDelete = await processWorkOSMembershipEvent({
          provider,
          repository,
          event: {
            ...membershipEvent,
            id: `event_delayed_delete_${suffix}`,
            event: "organization_membership.deleted",
          },
        });
        assert.equal(delayedDelete.active, true);

        await assert.rejects(
          syncIdentityFromSession({
            session: {
              user: { id: second.user.workosUserId },
              organizationId: second.organization.workosOrganizationId,
            },
            provider: { loadActiveIdentity: async () => second },
            repository,
          }),
          { code: "IDENTITY_MEMBERSHIP_MAPPING_CONFLICT" },
        );

        const leakedUser = await outerTransaction
          .select({ id: users.id })
          .from(users)
          .where(eq(users.workosUserId, second.user.workosUserId));
        const leakedOrganization = await outerTransaction
          .select({ id: organizations.id })
          .from(organizations)
          .where(
            eq(
              organizations.workosOrganizationId,
              second.organization.workosOrganizationId,
            ),
          );
        assert.equal(leakedUser.length, 0);
        assert.equal(leakedOrganization.length, 0);

        const memberships = await outerTransaction
          .select({ id: organizationMemberships.id })
          .from(organizationMemberships)
          .where(
            eq(
              organizationMemberships.workosMembershipId,
              first.membership.workosMembershipId,
            ),
          );
        assert.equal(memberships.length, 1);
        throw transactionRollback;
      }),
      (error) => error === transactionRollback,
    );
  } finally {
    await pool.end();
  }
});
