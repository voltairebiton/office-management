import "../scripts/env.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import test from "node:test";
import { createDatabase } from "../src/db/connection.js";
import {
  auditEvents,
  officeAssignments,
  offices,
  organizationMemberships,
  organizations,
  roomAssignments,
  rooms,
  users,
} from "../src/db/schema.js";
import {
  archiveOffice,
  archiveRoom,
  createOffice,
  createRoom,
  listOffices,
  listRooms,
  updateOffice,
} from "../src/lib/office-service.js";
import { buildAuthorizationContext } from "../src/lib/authorization.js";
import { resolveTestDatabaseUrl } from "../scripts/test-database-config.js";

test("C03 office and room services enforce scope, history, and audit in Postgres", async () => {
  const testDatabaseUrl = resolveTestDatabaseUrl({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    directDatabaseUrl: process.env.DIRECT_DATABASE_URL,
  });
  const { db, pool } = createDatabase(testDatabaseUrl);
  const suffix = randomUUID();
  const officeCode = `HQ-${suffix.slice(0, 8).toUpperCase()}`;
  const rollbackFixture = new Error("ROLLBACK_OFFICE_FIXTURE");

  try {
    await assert.rejects(
      db.transaction(async (transaction) => {
        const [organization] = await transaction
          .insert(organizations)
          .values({ workosOrganizationId: `org_${suffix}`, name: "Office test" })
          .returning();
        const [adminUser] = await transaction
          .insert(users)
          .values({ workosUserId: `user_admin_${suffix}`, email: `${suffix}@example.invalid` })
          .returning();
        const [adminMembership] = await transaction
          .insert(organizationMemberships)
          .values({
            organizationId: organization.id,
            userId: adminUser.id,
            workosMembershipId: `membership_admin_${suffix}`,
            role: "organization_admin",
            status: "active",
          })
          .returning();
        const adminContext = buildAuthorizationContext({
          actor: { id: adminUser.id },
          organization,
          membership: adminMembership,
        });

        const [managerUser] = await transaction
          .insert(users)
          .values({ workosUserId: `user_manager_${suffix}`, email: `manager-${suffix}@example.invalid` })
          .returning();
        const [managerMembership] = await transaction
          .insert(organizationMemberships)
          .values({
            organizationId: organization.id,
            userId: managerUser.id,
            workosMembershipId: `membership_manager_${suffix}`,
            role: "office_manager",
            status: "active",
          })
          .returning();

        const office = await createOffice(
          adminContext,
          { name: " Manila HQ ", code: officeCode.toLowerCase(), timezone: "Asia/Manila" },
          transaction,
        );
        assert.equal(office.name, "Manila HQ");
        assert.equal(office.code, officeCode);
        const officeAdminContext = buildAuthorizationContext({
          actor: { id: adminUser.id },
          organization,
          membership: adminMembership,
          offices: [office],
        });
        await assert.rejects(
          createOffice(officeAdminContext, { name: "Duplicate office", code: officeCode.toLowerCase() }, transaction),
          { code: "CONFLICT" },
          "office codes are unique within one tenant after normalization",
        );

        const [otherOrganization] = await transaction
          .insert(organizations)
          .values({ workosOrganizationId: `org_other_${suffix}`, name: "Other tenant" })
          .returning();
        await transaction.insert(offices).values({
          organizationId: otherOrganization.id,
          name: "Other HQ",
          code: officeCode,
        });
        const listed = await listOffices(officeAdminContext, { q: "manila", page: 1 }, transaction);
        assert.deepEqual(listed.rows.map((row) => row.id), [office.id]);

        await transaction.insert(officeAssignments).values({
          organizationId: organization.id,
          officeId: office.id,
          membershipId: managerMembership.id,
        });
        const managerContext = buildAuthorizationContext({
          actor: { id: managerUser.id },
          organization,
          membership: managerMembership,
          offices: [office],
          officeAssignments: [{
            organizationId: organization.id,
            officeId: office.id,
            membershipId: managerMembership.id,
            isActive: true,
          }],
        });

        const room = await createRoom(
          managerContext,
          office.id,
          { name: " Boardroom ", code: " br-1 ", capacity: 12 },
          transaction,
        );
        assert.equal(room.code, "BR-1");
        assert.equal((await listRooms(managerContext, office.id, {}, transaction)).rows[0].id, room.id);
        await assert.rejects(
          createOffice(managerContext, { name: "No", code: "NO" }, transaction),
          { code: "FORBIDDEN" },
          "office managers cannot create tenant offices",
        );
        await assert.rejects(
          createRoom(managerContext, office.id, { name: "Duplicate", code: "br-1" }, transaction),
          { code: "CONFLICT" },
          "room codes are unique within one office",
        );
        await assert.rejects(
          createRoom(managerContext, "00000000-0000-4000-8000-000000000000", {
            name: "Private room",
            code: "P1",
          }, transaction),
          { code: "NOT_FOUND" },
          "managers cannot address a foreign office",
        );
        await assert.rejects(archiveOffice(officeAdminContext, office.id, transaction), {
          code: "CONFLICT",
        }, "offices cannot be archived before their active rooms");
        const [assignment] = await transaction
          .insert(roomAssignments)
          .values({
            organizationId: organization.id,
            officeId: office.id,
            membershipId: managerMembership.id,
            roomId: room.id,
          })
          .returning();
        await assert.rejects(archiveRoom(managerContext, office.id, room.id, transaction), {
          code: "CONFLICT",
        }, "rooms with active assignments cannot be archived");
        await transaction
          .update(roomAssignments)
          .set({ endedAt: new Date() })
          .where(eq(roomAssignments.id, assignment.id));

        const updated = await updateOffice(
          officeAdminContext,
          office.id,
          { name: "Manila Headquarters", code: officeCode, timezone: "Asia/Manila", address: null },
          office.updatedAt,
          transaction,
        );
        assert.equal(updated.name, "Manila Headquarters");
        await assert.rejects(
          updateOffice(officeAdminContext, office.id, { name: "Stale", code: officeCode }, office.updatedAt, transaction),
          { code: "CONFLICT" },
          "stale office edits return a conflict",
        );

        await archiveRoom(managerContext, office.id, room.id, transaction);
        const archivedRooms = await listRooms(managerContext, office.id, { status: "archived" }, transaction);
        assert.deepEqual(archivedRooms.rows.map((row) => row.id), [room.id]);
        await archiveOffice(officeAdminContext, office.id, transaction);
        const [archivedOffice] = await transaction
          .select()
          .from(offices)
          .where(and(eq(offices.organizationId, organization.id), eq(offices.id, office.id)));
        assert.equal(archivedOffice.isActive, false);
        const archivedOffices = await listOffices(officeAdminContext, { status: "archived" }, transaction);
        assert.deepEqual(archivedOffices.rows.map((row) => row.id), [office.id]);
        assert.equal((await listOffices(officeAdminContext, { status: "active" }, transaction)).total, 0);
        const audit = await transaction
          .select({ operation: auditEvents.operation })
          .from(auditEvents)
          .where(eq(auditEvents.organizationId, organization.id));
        assert.deepEqual(audit.map((row) => row.operation).sort(), [
          "office.archived",
          "office.created",
          "office.updated",
          "room.archived",
          "room.created",
        ]);
        throw rollbackFixture;
      }),
      (error) => error === rollbackFixture,
    );
  } finally {
    await pool.end();
  }
});
