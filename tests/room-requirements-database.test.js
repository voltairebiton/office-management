import "../scripts/env.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
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
  roomStockRequirements,
  rooms,
  stockBalances,
  stockLocations,
  users,
} from "../src/db/schema.js";
import { buildAuthorizationContext } from "../src/lib/authorization.js";
import { adjustStock } from "../src/lib/adjustment-service.js";
import { receiveStock } from "../src/lib/stock-service.js";
import { transferStock } from "../src/lib/transfer-service.js";
import { listRoomNeeds, removeRoomRequirement, setRoomRequirement } from "../src/lib/room-requirement-service.js";
import { resolveTestDatabaseUrl } from "../scripts/test-database-config.js";

function testUrl() {
  return resolveTestDatabaseUrl({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    directDatabaseUrl: process.env.DIRECT_DATABASE_URL,
  });
}

async function createFixture(transaction, suffix) {
  const [organization] = await transaction.insert(organizations).values({
    workosOrganizationId: "org_room_need_" + suffix,
    name: "Room needs test",
  }).returning();
  const [adminUser, managerUser, employeeUser] = await transaction.insert(users).values([
    { workosUserId: "room_need_admin_" + suffix, email: "room-need-admin-" + suffix + "@example.invalid" },
    { workosUserId: "room_need_manager_" + suffix, email: "room-need-manager-" + suffix + "@example.invalid" },
    { workosUserId: "room_need_employee_" + suffix, email: "room-need-employee-" + suffix + "@example.invalid" },
  ]).returning();
  const [adminMembership, managerMembership, employeeMembership] = await transaction.insert(organizationMemberships).values([
    { organizationId: organization.id, userId: adminUser.id, workosMembershipId: "room_need_admin_m_" + suffix, role: "organization_admin", status: "active" },
    { organizationId: organization.id, userId: managerUser.id, workosMembershipId: "room_need_manager_m_" + suffix, role: "office_manager", status: "active" },
    { organizationId: organization.id, userId: employeeUser.id, workosMembershipId: "room_need_employee_m_" + suffix, role: "employee", status: "active" },
  ]).returning();
  const [office, otherOffice] = await transaction.insert(offices).values([
    { organizationId: organization.id, name: "Room need office", code: "RN-" + suffix.slice(0, 8).toUpperCase() },
    { organizationId: organization.id, name: "Other office", code: "RO-" + suffix.slice(0, 8).toUpperCase() },
  ]).returning();
  const [room, otherRoom] = await transaction.insert(rooms).values([
    { organizationId: organization.id, officeId: office.id, name: "Meeting room", code: "MEET" },
    { organizationId: organization.id, officeId: office.id, name: "Quiet room", code: "QUIET" },
  ]).returning();
  await transaction.insert(officeAssignments).values({
    organizationId: organization.id, officeId: office.id, membershipId: managerMembership.id, isActive: true,
  });
  await transaction.insert(roomAssignments).values({
    organizationId: organization.id, officeId: office.id, membershipId: managerMembership.id, roomId: room.id,
  });
  const [tissues, chairs] = await transaction.insert(inventoryItems).values([
    { organizationId: organization.id, sku: "TISSUE-1", name: "Facial tissues", category: "consumable", unit: "box" },
    { organizationId: organization.id, sku: "CHAIR-1", name: "Visitor chair", category: "reusable", unit: "piece" },
  ]).returning();
  const [storage, roomLocation, quietRoomLocation] = await transaction.insert(stockLocations).values([
    { organizationId: organization.id, officeId: office.id, kind: "storage", code: "STORE", name: "Main storeroom" },
    { organizationId: organization.id, officeId: office.id, roomId: room.id, kind: "room", code: "MEET", name: room.name },
    { organizationId: organization.id, officeId: office.id, roomId: otherRoom.id, kind: "room", code: "QUIET", name: otherRoom.name },
  ]).returning();
  const adminContext = buildAuthorizationContext({
    actor: { id: adminUser.id }, organization, membership: adminMembership, offices: [office, otherOffice],
  });
  const managerContext = buildAuthorizationContext({
    actor: { id: managerUser.id }, organization, membership: managerMembership, offices: [office, otherOffice],
    officeAssignments: [{ organizationId: organization.id, officeId: office.id, membershipId: managerMembership.id, isActive: true }],
  });
  const employeeContext = buildAuthorizationContext({
    actor: { id: employeeUser.id }, organization, membership: employeeMembership, offices: [office, otherOffice],
  });
  return { organization, office, otherOffice, room, otherRoom, tissues, chairs, storage, roomLocation, quietRoomLocation, adminContext, managerContext, employeeContext };
}

function requirement(fixture, values = {}) {
  return { officeId: fixture.office.id, roomId: fixture.room.id, itemId: fixture.tissues.id, targetQuantity: 6, expectedVersion: 0, ...values };
}

test("C09 target lifecycle and room needs reconcile with stock, scope, filters, and distinct assigned headcount", async () => {
  const { db, pool } = createDatabase(testUrl());
  const rollback = new Error("ROLLBACK_ROOM_REQUIREMENTS");
  try {
    await assert.rejects(db.transaction(async (transaction) => {
      const fixture = await createFixture(transaction, randomUUID());
      await receiveStock(fixture.adminContext, {
        officeId: fixture.office.id, locationId: fixture.storage.id, itemId: fixture.tissues.id,
        quantity: 10, reason: "opening", requestKey: randomUUID(),
      }, transaction);
      await transferStock(fixture.managerContext, {
        officeId: fixture.office.id, sourceLocationId: fixture.storage.id, destinationLocationId: fixture.roomLocation.id,
        itemId: fixture.tissues.id, quantity: 4, intent: "deployment", requestKey: randomUUID(),
      }, transaction);

      const created = await setRoomRequirement(fixture.managerContext, requirement(fixture), transaction);
      assert.equal(created.targetQuantity, 6);
      assert.equal(created.version, 1);
      await setRoomRequirement(fixture.managerContext, requirement(fixture, {
        itemId: fixture.chairs.id, targetQuantity: 2,
      }), transaction);
      const list = await listRoomNeeds(fixture.managerContext, { officeId: fixture.office.id }, transaction);
      const tissueRow = list.rows.find((row) => row.itemId === fixture.tissues.id);
      assert.equal(list.total, 2);
      assert.equal(tissueRow.deployed, 4);
      assert.equal(tissueRow.shortage, 2);
      assert.equal(tissueRow.status, "shortage");
      assert.equal(tissueRow.assignedHeadcount, 1);
      assert.equal(list.roomCountNeedingSupplies, 1);
      assert.deepEqual(list.shortagesByItem.map((row) => [row.itemId, row.shortage]), [[fixture.chairs.id, 2], [fixture.tissues.id, 2]]);

      await receiveStock(fixture.managerContext, {
        officeId: fixture.office.id, locationId: fixture.storage.id, itemId: fixture.tissues.id,
        quantity: 2, reason: "replenishment", requestKey: randomUUID(),
      }, transaction);
      const afterStorageReceipt = await listRoomNeeds(fixture.managerContext, { officeId: fixture.office.id, itemId: fixture.tissues.id }, transaction);
      assert.equal(afterStorageReceipt.rows[0].deployed, 4);
      assert.equal(afterStorageReceipt.rows[0].shortage, 2);

      await adjustStock(fixture.managerContext, {
        officeId: fixture.office.id, locationId: fixture.roomLocation.id, itemId: fixture.tissues.id,
        operation: "consumption", quantity: 1, reason: "Used by visitors", requestKey: randomUUID(),
      }, transaction);
      const afterConsumption = await listRoomNeeds(fixture.managerContext, { officeId: fixture.office.id }, transaction);
      const tissueAfterConsumption = afterConsumption.rows.find((row) => row.itemId === fixture.tissues.id);
      assert.equal(tissueAfterConsumption.deployed, 3);
      assert.equal(tissueAfterConsumption.shortage, 3);
      await adjustStock(fixture.managerContext, {
        officeId: fixture.office.id, locationId: fixture.roomLocation.id, itemId: fixture.tissues.id,
        operation: "count_correction", countedQuantity: 4, expectedVersion: 2,
        reason: "Recount after consumption", requestKey: randomUUID(),
      }, transaction);
      const afterCount = await listRoomNeeds(fixture.managerContext, { officeId: fixture.office.id }, transaction);
      const tissueAfterCount = afterCount.rows.find((row) => row.itemId === fixture.tissues.id);
      assert.equal(tissueAfterCount.deployed, 4);
      assert.equal(tissueAfterCount.shortage, 2);

      await assert.rejects(setRoomRequirement(fixture.employeeContext, requirement(fixture), transaction), { code: "FORBIDDEN" });
      await assert.rejects(setRoomRequirement(fixture.managerContext, requirement(fixture, {
        officeId: fixture.otherOffice.id,
      }), transaction), { code: "NOT_FOUND" });
      await assert.rejects(setRoomRequirement(fixture.managerContext, requirement(fixture, {
        expectedVersion: 4,
      }), transaction), { code: "CONFLICT" });
      await assert.rejects(listRoomNeeds(fixture.managerContext, { officeId: fixture.otherOffice.id }, transaction), { code: "NOT_FOUND" });

      await receiveStock(fixture.managerContext, {
        officeId: fixture.office.id, locationId: fixture.storage.id, itemId: fixture.chairs.id,
        quantity: 2, reason: "opening", requestKey: randomUUID(),
      }, transaction);
      const withUntrackedRoomStock = await transferStock(fixture.managerContext, {
        officeId: fixture.office.id, sourceLocationId: fixture.storage.id, destinationLocationId: fixture.quietRoomLocation.id,
        itemId: fixture.chairs.id, quantity: 2, intent: "deployment", requestKey: randomUUID(),
      }, transaction);
      assert.equal(withUntrackedRoomStock.destinationBalanceAfter, 2);
      const allNeeds = await listRoomNeeds(fixture.managerContext, { officeId: fixture.office.id }, transaction);
      assert.equal(allNeeds.total, 3);
      assert.ok(allNeeds.rows.some((row) => row.roomId === fixture.otherRoom.id && row.status === "untracked" && row.deployed === 2));
      assert.equal(allNeeds.shortagesByItem.length, 2);

      const updated = await setRoomRequirement(fixture.managerContext, requirement(fixture, {
        targetQuantity: 0, expectedVersion: 1,
      }), transaction);
      assert.equal(updated.id, created.id);
      assert.equal(updated.version, 2);
      assert.equal(updated.targetQuantity, 0);
      const zeroTargetList = await listRoomNeeds(fixture.managerContext, {
        officeId: fixture.office.id, status: "surplus", itemId: fixture.tissues.id,
      }, transaction);
      assert.equal(zeroTargetList.total, 1);
      assert.equal(zeroTargetList.rows[0].surplus, 4);
      const secondUpdate = await setRoomRequirement(fixture.managerContext, requirement(fixture, {
        targetQuantity: 0, expectedVersion: 2,
      }), transaction);
      assert.equal(secondUpdate.version, 2);

      const removed = await removeRoomRequirement(fixture.managerContext, {
        officeId: fixture.office.id, requirementId: created.id, expectedVersion: 2,
      }, transaction);
      assert.equal(removed.isActive, false);
      const afterRemoval = await listRoomNeeds(fixture.managerContext, { officeId: fixture.office.id }, transaction);
      assert.ok(afterRemoval.rows.some((row) => row.itemId === fixture.tissues.id && row.targetQuantity === null && row.deployed === 4));
      assert.equal(afterRemoval.total, 3);

      const [auditCount] = await transaction.select().from(auditEvents)
        .where(and(eq(auditEvents.organizationId, fixture.organization.id), eq(auditEvents.resourceType, "room-stock-requirement")));
      assert.ok(auditCount);
      const [persistedBalance] = await transaction.select().from(stockBalances)
        .where(and(eq(stockBalances.organizationId, fixture.organization.id), eq(stockBalances.locationId, fixture.roomLocation.id), eq(stockBalances.itemId, fixture.tissues.id)));
      assert.equal(persistedBalance.quantity, 4);
      const restored = await setRoomRequirement(fixture.managerContext, requirement(fixture, {
        targetQuantity: 5, expectedVersion: 0,
      }), transaction);
      assert.equal(restored.id, created.id);
      assert.equal(restored.version, 4);
      assert.equal(restored.isActive, true);
      const [requirementRows] = await transaction.select({ total: count() }).from(roomStockRequirements)
        .where(and(eq(roomStockRequirements.organizationId, fixture.organization.id), eq(roomStockRequirements.roomId, fixture.room.id), eq(roomStockRequirements.itemId, fixture.tissues.id)));
      assert.equal(Number(requirementRows.total), 1);
      throw rollback;
    }), (error) => error === rollback);
  } finally {
    await pool.end();
  }
});

test("C09 concurrent first target writes create one row and stale edits conflict", async () => {
  const primary = createDatabase(testUrl());
  const connectionA = createDatabase(testUrl());
  const connectionB = createDatabase(testUrl());
  try {
    const fixture = await primary.db.transaction((transaction) => createFixture(transaction, randomUUID()));
    const writes = await Promise.allSettled([
      setRoomRequirement(fixture.managerContext, requirement(fixture), connectionA.db),
      setRoomRequirement(fixture.managerContext, requirement(fixture), connectionB.db),
    ]);
    assert.equal(writes.filter((result) => result.status === "fulfilled").length, 2);
    const rows = await primary.db.select().from(roomStockRequirements)
      .where(and(eq(roomStockRequirements.organizationId, fixture.organization.id), eq(roomStockRequirements.officeId, fixture.office.id)));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].version, 1);
  } finally {
    await Promise.all([primary.pool.end(), connectionA.pool.end(), connectionB.pool.end()]);
  }
});
