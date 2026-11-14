import "../scripts/env.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
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
import { createDrizzleIdentityRepository } from "../src/lib/identity-repository.js";
import { buildAuthorizationContext } from "../src/lib/authorization.js";
import {
  assignMemberToRoom,
  endRoomAssignment,
  getAssignmentCounts,
  getRoomAssignmentCounts,
  grantOfficeAccess,
  listAssignableMembers,
  listMembers,
  listMemberOfficeAccess,
  listOwnAssignments,
  revokeOfficeAccess,
} from "../src/lib/people-service.js";
import { resolveTestDatabaseUrl } from "../scripts/test-database-config.js";

test("C04 people and room assignment services preserve tenant scope and history in Postgres", async () => {
  const testDatabaseUrl = resolveTestDatabaseUrl({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    directDatabaseUrl: process.env.DIRECT_DATABASE_URL,
  });
  const { db, pool } = createDatabase(testDatabaseUrl);
  const suffix = randomUUID();
  const rollbackFixture = new Error("ROLLBACK_PEOPLE_FIXTURE");

  try {
    await assert.rejects(
      db.transaction(async (transaction) => {
        const [organization] = await transaction.insert(organizations).values({
          workosOrganizationId: `org_people_${suffix}`,
          name: "People test",
        }).returning();
        const [otherOrganization] = await transaction.insert(organizations).values({
          workosOrganizationId: `org_people_other_${suffix}`,
          name: "Other people tenant",
        }).returning();
        const [adminUser, managerUser, employeeUser, foreignUser, inactiveUser] = await transaction.insert(users).values([
          { workosUserId: `people_admin_${suffix}`, email: `admin-${suffix}@example.invalid` },
          { workosUserId: `people_manager_${suffix}`, email: `manager-${suffix}@example.invalid` },
          { workosUserId: `people_employee_${suffix}`, email: `employee-${suffix}@example.invalid`, displayName: "Casey Employee" },
          { workosUserId: `people_foreign_${suffix}`, email: `foreign-${suffix}@example.invalid` },
          { workosUserId: `people_inactive_${suffix}`, email: `inactive-${suffix}@example.invalid` },
        ]).returning();
        const [adminMembership, managerMembership, employeeMembership, foreignMembership, inactiveMembership] = await transaction.insert(organizationMemberships).values([
          { organizationId: organization.id, userId: adminUser.id, workosMembershipId: `pm_admin_${suffix}`, role: "organization_admin", status: "active" },
          { organizationId: organization.id, userId: managerUser.id, workosMembershipId: `pm_manager_${suffix}`, role: "office_manager", status: "active" },
          { organizationId: organization.id, userId: employeeUser.id, workosMembershipId: `pm_employee_${suffix}`, role: "employee", status: "active" },
          { organizationId: otherOrganization.id, userId: foreignUser.id, workosMembershipId: `pm_foreign_${suffix}`, role: "employee", status: "active" },
          { organizationId: organization.id, userId: inactiveUser.id, workosMembershipId: `pm_inactive_${suffix}`, role: "employee", status: "inactive" },
        ]).returning();
        const [officeA, officeB] = await transaction.insert(offices).values([
          { organizationId: organization.id, name: "North office", code: `N-${suffix.slice(0, 8).toUpperCase()}` },
          { organizationId: organization.id, name: "South office", code: `S-${suffix.slice(0, 8).toUpperCase()}` },
        ]).returning();
        const [roomA1, roomA2, roomB] = await transaction.insert(rooms).values([
          { organizationId: organization.id, officeId: officeA.id, name: "Room A1", code: "A1", capacity: 4 },
          { organizationId: organization.id, officeId: officeA.id, name: "Room A2", code: "A2", capacity: 1 },
          { organizationId: organization.id, officeId: officeB.id, name: "Room B", code: "B1", capacity: 6 },
        ]).returning();
        await transaction.insert(officeAssignments).values({
          organizationId: organization.id,
          officeId: officeA.id,
          membershipId: managerMembership.id,
          isActive: true,
        });
        const adminContext = buildAuthorizationContext({
          actor: { id: adminUser.id }, organization, membership: adminMembership,
          offices: [officeA, officeB],
        });
        const managerContext = buildAuthorizationContext({
          actor: { id: managerUser.id }, organization, membership: managerMembership,
          offices: [officeA], officeAssignments: [{
            organizationId: organization.id, officeId: officeA.id,
            membershipId: managerMembership.id, isActive: true,
          }],
        });

        const directory = await listMembers(adminContext, { q: "casey", page: 1 }, transaction);
        assert.equal(directory.total, 1);
        assert.equal(directory.rows[0].id, employeeMembership.id);
        await assert.rejects(listMembers(managerContext, {}, transaction), { code: "FORBIDDEN" });

        const officeAccessA = await grantOfficeAccess(adminContext, employeeMembership.id, officeA.id, transaction);
        assert.equal(officeAccessA.isActive, true);
        await grantOfficeAccess(adminContext, employeeMembership.id, officeB.id, transaction);
        assert.deepEqual(
          (await listMemberOfficeAccess(adminContext, [employeeMembership.id, foreignMembership.id], transaction))
            .map(({ membershipId, officeId }) => ({ membershipId, officeId })),
          [
            { membershipId: employeeMembership.id, officeId: officeA.id },
            { membershipId: employeeMembership.id, officeId: officeB.id },
          ],
        );
        await assert.rejects(listMemberOfficeAccess(managerContext, [employeeMembership.id], transaction), { code: "FORBIDDEN" });
        await assert.rejects(
          grantOfficeAccess(managerContext, foreignMembership.id, officeA.id, transaction),
          { code: "FORBIDDEN" },
        );
        await assert.rejects(
          grantOfficeAccess(adminContext, foreignMembership.id, officeA.id, transaction),
          { code: "NOT_FOUND" },
        );
        await assert.rejects(
          grantOfficeAccess(adminContext, inactiveMembership.id, officeA.id, transaction),
          { code: "NOT_FOUND" },
        );
        const assignable = await listAssignableMembers(managerContext, officeA.id, { q: "casey" }, transaction);
        assert.deepEqual(assignable.rows.map((member) => member.id), [employeeMembership.id]);

        const firstAssignment = await assignMemberToRoom(
          managerContext,
          officeA.id,
          employeeMembership.id,
          roomA1.id,
          { expectedAssignmentId: null },
          transaction,
        );
        await assert.rejects(
          assignMemberToRoom(managerContext, officeA.id, foreignMembership.id, roomA1.id, {
            expectedAssignmentId: null,
          }, transaction),
          { code: "NOT_FOUND" },
        );
        const employeeContext = buildAuthorizationContext({
          actor: { id: employeeUser.id }, organization, membership: employeeMembership,
          offices: [officeA, officeB], officeAssignments: [
            { organizationId: organization.id, officeId: officeA.id, membershipId: employeeMembership.id, isActive: true },
            { organizationId: organization.id, officeId: officeB.id, membershipId: employeeMembership.id, isActive: true },
          ],
        });
        assert.deepEqual((await listOwnAssignments(employeeContext, transaction)).map((row) => row.roomId), [roomA1.id]);
        const reassigned = await assignMemberToRoom(
          managerContext,
          officeA.id,
          employeeMembership.id,
          roomA2.id,
          { expectedAssignmentId: firstAssignment.id },
          transaction,
        );
        assert.equal(reassigned.roomId, roomA2.id);
        await assert.rejects(
          assignMemberToRoom(managerContext, officeA.id, employeeMembership.id, roomA1.id, {
            expectedAssignmentId: firstAssignment.id,
          }, transaction),
          { code: "CONFLICT" },
        );
        const officeBAssignment = await assignMemberToRoom(
          adminContext,
          officeB.id,
          employeeMembership.id,
          roomB.id,
          { expectedAssignmentId: null },
          transaction,
        );
        const managerAssignment = await assignMemberToRoom(
          managerContext,
          officeA.id,
          managerMembership.id,
          roomA2.id,
          { expectedAssignmentId: null },
          transaction,
        );
        const roomCounts = await getRoomAssignmentCounts(adminContext, officeA.id, transaction);
        assert.deepEqual(roomCounts.find((row) => row.roomId === roomA2.id), {
          roomId: roomA2.id,
          capacity: 1,
          assignedCount: 2,
          overCapacity: true,
        });
        const counts = await getAssignmentCounts(adminContext, transaction);
        assert.deepEqual(Object.fromEntries(counts.offices.map((row) => [row.officeId, row.assignedCount])), {
          [officeA.id]: 2,
          [officeB.id]: 1,
        });
        assert.equal(counts.distinctActiveMembers, 2);

        await endRoomAssignment(managerContext, officeA.id, managerMembership.id, {
          expectedAssignmentId: managerAssignment.id,
        }, transaction);
        await revokeOfficeAccess(adminContext, employeeMembership.id, officeA.id, transaction);
        assert.deepEqual((await listOwnAssignments(employeeContext, transaction)).map((row) => row.id), [officeBAssignment.id]);
        await revokeOfficeAccess(adminContext, managerMembership.id, officeA.id, transaction);
        const countsAfterRevocation = await getAssignmentCounts(adminContext, transaction);
        assert.deepEqual(Object.fromEntries(countsAfterRevocation.offices.map((row) => [row.officeId, row.assignedCount])), {
          [officeA.id]: 0,
          [officeB.id]: 1,
        });

        const identityRepository = createDrizzleIdentityRepository(transaction);
        await identityRepository.transaction(async (repoTransaction) => {
          await repoTransaction.deactivateMembership(employeeMembership.workosMembershipId);
        });
        assert.deepEqual(await listOwnAssignments(employeeContext, transaction), []);
        const countsAfterDeactivation = await getAssignmentCounts(adminContext, transaction);
        assert.deepEqual(Object.fromEntries(countsAfterDeactivation.offices.map((row) => [row.officeId, row.assignedCount])), {
          [officeA.id]: 0,
          [officeB.id]: 0,
        });
        assert.equal(countsAfterDeactivation.distinctActiveMembers, 0);
        const history = await transaction.select().from(roomAssignments)
          .where(and(eq(roomAssignments.organizationId, organization.id), eq(roomAssignments.membershipId, employeeMembership.id)));
        assert.equal(history.length, 3);
        assert.ok(history.every((row) => row.endedAt instanceof Date));
        const audit = await transaction.select({ operation: auditEvents.operation }).from(auditEvents)
          .where(eq(auditEvents.organizationId, organization.id));
        assert.ok(audit.some((row) => row.operation === "office_access.granted"));
        assert.ok(audit.some((row) => row.operation === "room_assignment.reassigned"));
        assert.ok(audit.some((row) => row.operation === "office_access.revoked"));
        throw rollbackFixture;
      }),
      (error) => error === rollbackFixture,
    );
  } finally {
    await pool.end();
  }
});

test("C04-AC5 separate connections serialize concurrent first assignments", async () => {
  const testDatabaseUrl = resolveTestDatabaseUrl({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    directDatabaseUrl: process.env.DIRECT_DATABASE_URL,
  });
  const primary = createDatabase(testDatabaseUrl);
  const connectionA = createDatabase(testDatabaseUrl);
  const connectionB = createDatabase(testDatabaseUrl);
  const suffix = randomUUID();
  const userIds = [randomUUID(), randomUUID(), randomUUID()];
  let organizationId;

  try {
    const fixture = await primary.db.transaction(async (transaction) => {
      const [organization] = await transaction.insert(organizations).values({
        workosOrganizationId: `org_concurrent_${suffix}`,
        name: "Concurrent assignments",
      }).returning();
      organizationId = organization.id;
      const [adminUser, managerUser, employeeUser] = await transaction.insert(users).values([
        { id: userIds[0], workosUserId: `concurrent_admin_${suffix}`, email: `concurrent-admin-${suffix}@example.invalid` },
        { id: userIds[1], workosUserId: `concurrent_manager_${suffix}`, email: `concurrent-manager-${suffix}@example.invalid` },
        { id: userIds[2], workosUserId: `concurrent_employee_${suffix}`, email: `concurrent-employee-${suffix}@example.invalid` },
      ]).returning();
      const [adminMembership, managerMembership, employeeMembership] = await transaction.insert(organizationMemberships).values([
        { organizationId: organization.id, userId: adminUser.id, workosMembershipId: `cm_admin_${suffix}`, role: "organization_admin", status: "active" },
        { organizationId: organization.id, userId: managerUser.id, workosMembershipId: `cm_manager_${suffix}`, role: "office_manager", status: "active" },
        { organizationId: organization.id, userId: employeeUser.id, workosMembershipId: `cm_employee_${suffix}`, role: "employee", status: "active" },
      ]).returning();
      const [office] = await transaction.insert(offices).values({
        organizationId: organization.id,
        name: "Concurrent office",
        code: `C-${suffix.slice(0, 8).toUpperCase()}`,
      }).returning();
      const [roomA, roomB] = await transaction.insert(rooms).values([
        { organizationId: organization.id, officeId: office.id, name: "North room", code: "N1" },
        { organizationId: organization.id, officeId: office.id, name: "South room", code: "S1" },
      ]).returning();
      await transaction.insert(officeAssignments).values([
        { organizationId: organization.id, officeId: office.id, membershipId: managerMembership.id, isActive: true },
        { organizationId: organization.id, officeId: office.id, membershipId: employeeMembership.id, isActive: true },
      ]);
      return {
        organization,
        office,
        roomA,
        roomB,
        adminContext: buildAuthorizationContext({
          actor: { id: adminUser.id }, organization, membership: adminMembership, offices: [office],
        }),
        managerContext: buildAuthorizationContext({
          actor: { id: managerUser.id }, organization, membership: managerMembership,
          offices: [office], officeAssignments: [{
            organizationId: organization.id, officeId: office.id,
            membershipId: managerMembership.id, isActive: true,
          }],
        }),
        employeeMembership,
      };
    });

    const attempts = await Promise.allSettled([
      assignMemberToRoom(
        fixture.managerContext,
        fixture.office.id,
        fixture.employeeMembership.id,
        fixture.roomA.id,
        { expectedAssignmentId: null },
        connectionA.db,
        { writeAudit: async () => {} },
      ),
      assignMemberToRoom(
        fixture.managerContext,
        fixture.office.id,
        fixture.employeeMembership.id,
        fixture.roomB.id,
        { expectedAssignmentId: null },
        connectionB.db,
        { writeAudit: async () => {} },
      ),
    ]);
    assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = attempts.find((result) => result.status === "rejected");
    assert.equal(rejected.reason.code, "CONFLICT");
    const [activeAssignments] = await primary.db.select({ total: count() })
      .from(roomAssignments)
      .where(and(
        eq(roomAssignments.organizationId, organizationId),
        eq(roomAssignments.membershipId, fixture.employeeMembership.id),
        isNull(roomAssignments.endedAt),
      ));
    assert.equal(activeAssignments.total, 1);
  } finally {
    if (organizationId) {
      await primary.db.transaction(async (transaction) => {
        await transaction.delete(roomAssignments).where(eq(roomAssignments.organizationId, organizationId));
        await transaction.delete(officeAssignments).where(eq(officeAssignments.organizationId, organizationId));
        await transaction.delete(rooms).where(eq(rooms.organizationId, organizationId));
        await transaction.delete(offices).where(eq(offices.organizationId, organizationId));
        await transaction.delete(organizationMemberships).where(eq(organizationMemberships.organizationId, organizationId));
        await transaction.delete(users).where(inArray(users.id, userIds));
        await transaction.delete(organizations).where(eq(organizations.id, organizationId));
      });
    }
    await Promise.all([primary.pool.end(), connectionA.pool.end(), connectionB.pool.end()]);
  }
});
