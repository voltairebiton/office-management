import "../scripts/env.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import test from "node:test";
import { createDatabase } from "../src/db/connection.js";
import {
  auditEvents,
  inventoryItems,
  officeAssignments,
  offices,
  organizationMemberships,
  organizations,
  roomAssignments,
  rooms,
  stockLocations,
  users,
} from "../src/db/schema.js";
import { buildAuthorizationContext } from "../src/lib/authorization.js";
import { loadWorkspaceOverview } from "../src/lib/workspace-dashboard-service.js";
import { renameWorkspace } from "../src/lib/workspace-settings-service.js";
import { receiveStock, transferStock } from "../src/lib/stock-service.js";
import { setRoomRequirement } from "../src/lib/room-requirement-service.js";
import { resolveTestDatabaseUrl } from "../scripts/test-database-config.js";

function testUrl() {
  return resolveTestDatabaseUrl({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    directDatabaseUrl: process.env.DIRECT_DATABASE_URL,
  });
}

test("C10-AC2/AC3 loads active scoped counts, distinct assigned people, shortages by room, and grouped activity", async () => {
  const { db, pool } = createDatabase(testUrl());
  const rollback = new Error("ROLLBACK_C10_WORKSPACE_OVERVIEW");
  try {
    await assert.rejects(db.transaction(async (transaction) => {
      const suffix = randomUUID();
      const [organization] = await transaction.insert(organizations).values({
        workosOrganizationId: `overview_org_${suffix}`,
        name: "Overview test workspace",
      }).returning();
      const [adminUser, employeeUser] = await transaction.insert(users).values([
        { workosUserId: `overview_admin_${suffix}`, email: `overview-admin-${suffix}@example.invalid` },
        { workosUserId: `overview_employee_${suffix}`, email: `overview-employee-${suffix}@example.invalid` },
      ]).returning();
      const [adminMembership, employeeMembership] = await transaction.insert(organizationMemberships).values([
        { organizationId: organization.id, userId: adminUser.id, workosMembershipId: `overview_admin_m_${suffix}`, role: "organization_admin", status: "active" },
        { organizationId: organization.id, userId: employeeUser.id, workosMembershipId: `overview_employee_m_${suffix}`, role: "employee", status: "active" },
      ]).returning();
      const [north, south, archived] = await transaction.insert(offices).values([
        { organizationId: organization.id, name: "North office", code: `N-${suffix.slice(0, 8)}` },
        { organizationId: organization.id, name: "South office", code: `S-${suffix.slice(0, 8)}` },
        { organizationId: organization.id, name: "Archived office", code: `A-${suffix.slice(0, 8)}`, isActive: false },
      ]).returning();
      const [northMeeting, northQuiet, southBoardroom] = await transaction.insert(rooms).values([
        { organizationId: organization.id, officeId: north.id, name: "Meeting room", code: "MEET" },
        { organizationId: organization.id, officeId: north.id, name: "Quiet room", code: "QUIET" },
        { organizationId: organization.id, officeId: south.id, name: "Boardroom", code: "BOARD" },
        { organizationId: organization.id, officeId: archived.id, name: "Old room", code: "OLD" },
      ]).returning();
      await transaction.insert(officeAssignments).values([
        { organizationId: organization.id, officeId: north.id, membershipId: employeeMembership.id, isActive: true },
        { organizationId: organization.id, officeId: south.id, membershipId: employeeMembership.id, isActive: true },
      ]);
      await transaction.insert(roomAssignments).values([
        { organizationId: organization.id, officeId: north.id, membershipId: employeeMembership.id, roomId: northMeeting.id },
        { organizationId: organization.id, officeId: south.id, membershipId: employeeMembership.id, roomId: southBoardroom.id },
      ]);
      const [tissues, chairs] = await transaction.insert(inventoryItems).values([
        { organizationId: organization.id, sku: `T-${suffix.slice(0, 8).toUpperCase()}`, name: "Tissues", category: "consumable", unit: "box" },
        { organizationId: organization.id, sku: `C-${suffix.slice(0, 8).toUpperCase()}`, name: "Chairs", category: "reusable", unit: "piece" },
      ]).returning();
      const [storage, northRoomLocation] = await transaction.insert(stockLocations).values([
        { organizationId: organization.id, officeId: north.id, kind: "storage", code: `STORE-${suffix.slice(0, 8).toUpperCase()}`, name: "Main storeroom" },
        { organizationId: organization.id, officeId: north.id, roomId: northMeeting.id, kind: "room", code: `MEET-${suffix.slice(0, 8).toUpperCase()}`, name: northMeeting.name },
      ]).returning();
      const adminContext = buildAuthorizationContext({
        actor: { id: adminUser.id },
        organization,
        membership: adminMembership,
        offices: [north, south, archived],
      });
      const employeeContext = buildAuthorizationContext({
        actor: { id: employeeUser.id },
        organization,
        membership: employeeMembership,
        offices: [north, south, archived],
        officeAssignments: [
          { organizationId: organization.id, officeId: north.id, membershipId: employeeMembership.id, isActive: true },
        ],
      });

      await setRoomRequirement(adminContext, {
        officeId: north.id, roomId: northMeeting.id, itemId: tissues.id, targetQuantity: 3, expectedVersion: 0,
      }, transaction);
      await setRoomRequirement(adminContext, {
        officeId: north.id, roomId: northMeeting.id, itemId: chairs.id, targetQuantity: 1, expectedVersion: 0,
      }, transaction);
      await setRoomRequirement(adminContext, {
        officeId: south.id, roomId: southBoardroom.id, itemId: tissues.id, targetQuantity: 1, expectedVersion: 0,
      }, transaction);
      await receiveStock(adminContext, {
        officeId: north.id, locationId: storage.id, itemId: tissues.id, quantity: 4,
        reason: "Opening balance", requestKey: randomUUID(),
      }, transaction);
      await transferStock(adminContext, {
        officeId: north.id, sourceLocationId: storage.id, destinationLocationId: northRoomLocation.id,
        itemId: tissues.id, quantity: 1, intent: "deployment", requestKey: randomUUID(),
      }, transaction);

      const result = await loadWorkspaceOverview(adminContext, transaction);
      assert.equal(result.live, true);
      assert.equal(result.officeCount, 2);
      assert.equal(result.roomCount, 3);
      assert.equal(result.assignedEmployeeCount, 1, "one person assigned in two offices counts once globally");
      assert.equal(result.peopleCountsByOffice[north.id], 1);
      assert.equal(result.peopleCountsByOffice[south.id], 1);
      assert.equal(result.roomsNeedingSupplies, 2, "two shortage items in one room count as one room");
      assert.equal(result.roomNeedsByOffice[north.id], 1);
      assert.equal(result.roomNeedsByOffice[south.id], 1);
      assert.ok(result.offices.every((office) => office.id !== archived.id));
      assert.ok(result.needs.every((row) => row.deployed < row.target));
      assert.deepEqual(new Set(result.movements.map((row) => row.kind)), new Set(["Receipt", "Deployment"]));
      assert.equal(result.movements.filter((row) => row.kind === "Deployment").length, 1, "transfer legs are presented as one activity");
      assert.ok(result.movements.every((row) => row.transactionId));

      const providerCalls = [];
      const provider = {
        async updateOrganizationName(input) {
          providerCalls.push(input);
          return { id: input.organizationId, name: input.name };
        },
      };
      await assert.rejects(renameWorkspace(adminContext, {
        workosOrganizationId: organization.workosOrganizationId,
        name: "New workspace name",
        expectedName: "Stale name",
      }, provider, transaction), { code: "CONFLICT" });
      assert.equal(providerCalls.length, 0, "stale edits do not change the identity provider");
      await assert.rejects(renameWorkspace(employeeContext, {
        workosOrganizationId: organization.workosOrganizationId,
        name: "New workspace name",
        expectedName: organization.name,
      }, provider, transaction), { code: "FORBIDDEN" });
      const renamed = await renameWorkspace(adminContext, {
        workosOrganizationId: organization.workosOrganizationId,
        name: "New workspace name",
        expectedName: organization.name,
      }, provider, transaction);
      assert.equal(renamed.name, "New workspace name");
      assert.equal(providerCalls.length, 1);
      const nameAudit = await transaction.select().from(auditEvents)
        .where(eq(auditEvents.operation, "workspace.name.updated"));
      assert.equal(nameAudit.length, 1);

      const employeeResult = await loadWorkspaceOverview(employeeContext, transaction);
      assert.equal(employeeResult.officeCount, 0, "employee overview does not expose office-wide aggregates");
      assert.deepEqual(employeeResult.offices, []);
      assert.deepEqual(employeeResult.movements, []);
      throw rollback;
    }), /ROLLBACK_C10_WORKSPACE_OVERVIEW/);
  } finally {
    await pool.end();
  }
});

test("C10-AC1 propagates provider/database failures instead of substituting preview rows", async () => {
  const failure = new Error("database unavailable");
  const failingDatabase = { select() { throw failure; } };
  const context = {
    active: true,
    organizationId: randomUUID(),
    role: "organization_admin",
    officeIds: [randomUUID()],
    capabilities: ["offices:read"],
  };
  await assert.rejects(loadWorkspaceOverview(context, failingDatabase), (error) => error === failure);
});

test("C10-AC1 treats an empty authorized tenant as live empty data", async () => {
  const { db, pool } = createDatabase(testUrl());
  const rollback = new Error("ROLLBACK_C10_EMPTY_WORKSPACE");
  try {
    await assert.rejects(db.transaction(async (transaction) => {
      const suffix = randomUUID();
      const [organization] = await transaction.insert(organizations).values({
        workosOrganizationId: `overview_empty_${suffix}`,
        name: "Empty workspace",
      }).returning();
      const [user] = await transaction.insert(users).values({
        workosUserId: `overview_empty_user_${suffix}`,
        email: `overview-empty-${suffix}@example.invalid`,
      }).returning();
      const [membership] = await transaction.insert(organizationMemberships).values({
        organizationId: organization.id,
        userId: user.id,
        workosMembershipId: `overview_empty_m_${suffix}`,
        role: "organization_admin",
        status: "active",
      }).returning();
      const context = buildAuthorizationContext({ actor: { id: user.id }, organization, membership });
      const result = await loadWorkspaceOverview(context, transaction);
      assert.equal(result.live, true);
      assert.equal(result.officeCount, 0);
      assert.equal(result.roomCount, 0);
      assert.deepEqual(result.offices, []);
      assert.deepEqual(result.needs, []);
      assert.deepEqual(result.movements, []);
      throw rollback;
    }), /ROLLBACK_C10_EMPTY_WORKSPACE/);
  } finally {
    await pool.end();
  }
});
