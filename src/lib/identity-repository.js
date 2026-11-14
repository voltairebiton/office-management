import "server-only";
import { and, eq } from "drizzle-orm";
import {
  organizationMemberships,
  organizations,
  processedWorkOSEvents,
  users,
} from "../db/schema.js";
import { getDatabase } from "../db/index.js";

function syncError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function createDrizzleIdentityRepository(database = getDatabase()) {
  return {
    async hasProcessedWorkOSEvent(workosEventId) {
      const records = await database
        .select({ workosEventId: processedWorkOSEvents.workosEventId })
        .from(processedWorkOSEvents)
        .where(eq(processedWorkOSEvents.workosEventId, workosEventId))
        .limit(1);
      return records.length > 0;
    },

    transaction(work) {
      return database.transaction((transaction) =>
        work({
          async upsertUser(values) {
            const [record] = await transaction
              .insert(users)
              .values(values)
              .onConflictDoUpdate({
                target: users.workosUserId,
                set: {
                  email: values.email,
                  displayName: values.displayName,
                  updatedAt: new Date(),
                },
              })
              .returning();
            return record;
          },

          async upsertOrganization(values) {
            const [record] = await transaction
              .insert(organizations)
              .values(values)
              .onConflictDoUpdate({
                target: organizations.workosOrganizationId,
                set: {
                  name: values.name,
                  updatedAt: new Date(),
                },
              })
              .returning();
            return record;
          },

          async upsertMembership(values) {
            const [existing] = await transaction
              .select({ organizationId: organizationMemberships.organizationId, userId: organizationMemberships.userId })
              .from(organizationMemberships)
              .where(
                eq(
                  organizationMemberships.workosMembershipId,
                  values.workosMembershipId,
                ),
              )
              .limit(1);

            if (
              existing &&
              (existing.organizationId !== values.organizationId ||
                existing.userId !== values.userId)
            ) {
              throw syncError(
                "IDENTITY_MEMBERSHIP_MAPPING_CONFLICT",
                "The provider membership conflicts with an existing local identity.",
              );
            }

            const [existingForUser] = await transaction
              .select({
                id: organizationMemberships.id,
                workosMembershipId: organizationMemberships.workosMembershipId,
              })
              .from(organizationMemberships)
              .where(
                and(
                  eq(organizationMemberships.organizationId, values.organizationId),
                  eq(organizationMemberships.userId, values.userId),
                ),
              )
              .limit(1);

            if (existingForUser) {
              const [record] = await transaction
                .update(organizationMemberships)
                .set({
                  workosMembershipId: values.workosMembershipId,
                  status: values.status,
                  updatedAt: new Date(),
                })
                .where(eq(organizationMemberships.id, existingForUser.id))
                .returning();
              return record;
            }

            const [record] = await transaction
              .insert(organizationMemberships)
              .values(values)
              .onConflictDoUpdate({
                target: organizationMemberships.workosMembershipId,
                set: {
                  status: values.status,
                  updatedAt: new Date(),
                },
              })
              .returning();
            return record;
          },

          async deactivateMembership(workosMembershipId) {
            await transaction
              .update(organizationMemberships)
              .set({ status: "inactive", updatedAt: new Date() })
              .where(
                eq(
                  organizationMemberships.workosMembershipId,
                  workosMembershipId,
                ),
              );
          },

          async claimWorkOSEvent(values) {
            const inserted = await transaction
              .insert(processedWorkOSEvents)
              .values(values)
              .onConflictDoNothing({
                target: processedWorkOSEvents.workosEventId,
              })
              .returning({ workosEventId: processedWorkOSEvents.workosEventId });
            return inserted.length === 1;
          },

          async countOrganizationAdmins(organizationId) {
            const records = await transaction
              .select({ id: organizationMemberships.id })
              .from(organizationMemberships)
              .where(
                and(
                  eq(organizationMemberships.organizationId, organizationId),
                  eq(organizationMemberships.role, "organization_admin"),
                  eq(organizationMemberships.status, "active"),
                ),
              );
            return records.length;
          },

          async setMembershipRole(membershipId, role) {
            const [record] = await transaction
              .update(organizationMemberships)
              .set({ role, updatedAt: new Date() })
              .where(eq(organizationMemberships.id, membershipId))
              .returning();
            if (!record) {
              throw syncError(
                "IDENTITY_MEMBERSHIP_MAPPING_CONFLICT",
                "The verified membership could not be updated.",
              );
            }
            return record;
          },
        }),
      );
    },
  };
}
