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
  rooms,
  stockBalances,
  stockLocations,
  stockMovements,
  stockTransactions,
  users,
} from "../src/db/schema.js";
import { buildAuthorizationContext } from "../src/lib/authorization.js";
import { archiveItem, archiveLocation } from "../src/lib/catalog-service.js";
import { listStockMovements, receiveStock } from "../src/lib/stock-service.js";
import { transferStock } from "../src/lib/transfer-service.js";
import { resolveTestDatabaseUrl } from "../scripts/test-database-config.js";

function request({ officeId, sourceLocationId, destinationLocationId, itemId, quantity, intent, requestKey = randomUUID(), reference = null }) {
  return { officeId, sourceLocationId, destinationLocationId, itemId, quantity, intent, requestKey, reference };
}

async function createFixture(transaction, suffix) {
  const [organization] = await transaction.insert(organizations).values({
    workosOrganizationId: "org_transfer_" + suffix,
    name: "Transfer test",
  }).returning();
  const [adminUser, managerUser, employeeUser] = await transaction.insert(users).values([
    { workosUserId: "transfer_admin_" + suffix, email: "transfer-admin-" + suffix + "@example.invalid" },
    { workosUserId: "transfer_manager_" + suffix, email: "transfer-manager-" + suffix + "@example.invalid" },
    { workosUserId: "transfer_employee_" + suffix, email: "transfer-employee-" + suffix + "@example.invalid" },
  ]).returning();
  const [adminMembership, managerMembership, employeeMembership] = await transaction.insert(organizationMemberships).values([
    { organizationId: organization.id, userId: adminUser.id, workosMembershipId: "transfer_admin_m_" + suffix, role: "organization_admin", status: "active" },
    { organizationId: organization.id, userId: managerUser.id, workosMembershipId: "transfer_manager_m_" + suffix, role: "office_manager", status: "active" },
    { organizationId: organization.id, userId: employeeUser.id, workosMembershipId: "transfer_employee_m_" + suffix, role: "employee", status: "active" },
  ]).returning();
  const [office, otherOffice] = await transaction.insert(offices).values([
    { organizationId: organization.id, name: "Transfer office", code: "TR-" + suffix.slice(0, 8).toUpperCase() },
    { organizationId: organization.id, name: "Other transfer office", code: "OT-" + suffix.slice(0, 8).toUpperCase() },
  ]).returning();
  const [room] = await transaction.insert(rooms).values({
    organizationId: organization.id, officeId: office.id, name: "Meeting room", code: "MEET-1",
  }).returning();
  await transaction.insert(officeAssignments).values({
    organizationId: organization.id, officeId: office.id, membershipId: managerMembership.id, isActive: true,
  });
  const [item] = await transaction.insert(inventoryItems).values({
    organizationId: organization.id, sku: "CHAIR-1", name: "Visitor chair", category: "reusable", unit: "piece",
  }).returning();
  const [storage, roomLocation, secondStorage] = await transaction.insert(stockLocations).values([
    { organizationId: organization.id, officeId: office.id, kind: "storage", code: "STORE-A", name: "Main storeroom" },
    { organizationId: organization.id, officeId: office.id, roomId: room.id, kind: "room", code: "ROOM-A", name: room.name },
    { organizationId: organization.id, officeId: office.id, kind: "storage", code: "STORE-B", name: "Overflow storeroom" },
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
  return { organization, office, otherOffice, item, storage, roomLocation, secondStorage, adminContext, managerContext, employeeContext };
}

function testUrl() {
  return resolveTestDatabaseUrl({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    directDatabaseUrl: process.env.DIRECT_DATABASE_URL,
  });
}

test("C07 transfers are atomic, conserving, scoped, retryable, and retain history", async () => {
  const { db, pool } = createDatabase(testUrl());
  const rollback = new Error("ROLLBACK_TRANSFER_FIXTURE");
  try {
    await assert.rejects(db.transaction(async (transaction) => {
      const fixture = await createFixture(transaction, randomUUID());
      await receiveStock(fixture.adminContext, {
        officeId: fixture.office.id, locationId: fixture.storage.id, itemId: fixture.item.id,
        quantity: 10, reason: "opening", requestKey: randomUUID(),
      }, transaction);

      const storageMove = request({
        officeId: fixture.office.id, sourceLocationId: fixture.storage.id, destinationLocationId: fixture.secondStorage.id,
        itemId: fixture.item.id, quantity: 1, intent: "transfer",
      });
      const movedBetweenStores = await transferStock(fixture.managerContext, storageMove, transaction);
      assert.equal(movedBetweenStores.movements.length, 2);
      assert.equal(movedBetweenStores.outgoing.movementType, "transfer_out");
      assert.equal(movedBetweenStores.incoming.movementType, "transfer_in");
      assert.equal(movedBetweenStores.outgoing.quantityDelta + movedBetweenStores.incoming.quantityDelta, 0);

      const deployment = request({
        officeId: fixture.office.id, sourceLocationId: fixture.storage.id, destinationLocationId: fixture.roomLocation.id,
        itemId: fixture.item.id, quantity: 8, intent: "deployment", reference: "Meeting room setup",
      });
      const deployed = await transferStock(fixture.managerContext, deployment, transaction);
      assert.equal(deployed.sourceBalanceAfter, 1);
      assert.equal(deployed.destinationBalanceAfter, 8);
      assert.equal(deployed.outgoing.movementType, "deployment");
      assert.equal(deployed.outgoing.quantityDelta, -8);
      assert.equal(deployed.incoming.quantityDelta, 8);
      const replay = await transferStock(fixture.managerContext, deployment, transaction);
      assert.equal(replay.transactionId, deployed.transactionId);
      assert.equal(replay.outgoing.id, deployed.outgoing.id);
      assert.equal(replay.replayed, true);
      await assert.rejects(transferStock(fixture.managerContext, { ...deployment, quantity: 7 }, transaction), { code: "CONFLICT" });

      const failedReturn = request({
        officeId: fixture.office.id, sourceLocationId: fixture.roomLocation.id, destinationLocationId: fixture.storage.id,
        itemId: fixture.item.id, quantity: 3, intent: "return",
      });
      await assert.rejects(transferStock(fixture.managerContext, failedReturn, transaction, {
        afterDebit: async () => { throw new Error("INJECTED_BETWEEN_LEGS"); },
      }), /INJECTED_BETWEEN_LEGS/);
      const failedHeader = await transaction.select().from(stockTransactions)
        .where(eq(stockTransactions.requestKey, failedReturn.requestKey));
      assert.equal(failedHeader.length, 0);
      const [failedLegs] = await transaction.select({ total: count() }).from(stockMovements)
        .innerJoin(stockTransactions, and(
          eq(stockTransactions.organizationId, stockMovements.organizationId),
          eq(stockTransactions.id, stockMovements.transactionId),
        ))
        .where(eq(stockTransactions.requestKey, failedReturn.requestKey));
      assert.equal(Number(failedLegs.total), 0);

      await assert.rejects(transferStock(fixture.employeeContext, deployment, transaction), { code: "FORBIDDEN" });
      await assert.rejects(transferStock(fixture.managerContext, request({
        officeId: fixture.otherOffice.id, sourceLocationId: fixture.storage.id, destinationLocationId: fixture.roomLocation.id,
        itemId: fixture.item.id, quantity: 1, intent: "deployment",
      }), transaction), { code: "NOT_FOUND" });
      await assert.rejects(transferStock(fixture.managerContext, request({
        officeId: fixture.office.id, sourceLocationId: fixture.roomLocation.id, destinationLocationId: fixture.storage.id,
        itemId: fixture.item.id, quantity: 9, intent: "return",
      }), transaction), { code: "CONFLICT" });

      const returned = await transferStock(fixture.managerContext, failedReturn, transaction);
      assert.equal(returned.sourceBalanceAfter, 5);
      assert.equal(returned.destinationBalanceAfter, 4);
      assert.equal(returned.outgoing.movementType, "return");
      const redeployed = await transferStock(fixture.managerContext, request({
        officeId: fixture.office.id, sourceLocationId: fixture.storage.id, destinationLocationId: fixture.roomLocation.id,
        itemId: fixture.item.id, quantity: 4, intent: "deployment",
      }), transaction);
      assert.equal(redeployed.sourceBalanceAfter, 0);
      assert.equal(redeployed.destinationBalanceAfter, 9);

      await assert.rejects(archiveItem(fixture.adminContext, fixture.item.id, transaction), { code: "CONFLICT" });
      await archiveLocation(fixture.managerContext, fixture.office.id, fixture.storage.id, transaction);
      const historyForArchivedLocation = await transaction.select().from(stockMovements)
        .where(and(eq(stockMovements.organizationId, fixture.organization.id), eq(stockMovements.locationId, fixture.storage.id)));
      assert.ok(historyForArchivedLocation.length >= 3);
      const visibleHistory = await listStockMovements(fixture.managerContext, fixture.office.id, {}, transaction);
      assert.ok(visibleHistory.rows.some((movement) => movement.locationId === fixture.storage.id));
      const itemBalances = await transaction.select({ quantity: stockBalances.quantity }).from(stockBalances)
        .where(and(eq(stockBalances.organizationId, fixture.organization.id), eq(stockBalances.officeId, fixture.office.id), eq(stockBalances.itemId, fixture.item.id)));
      assert.equal(itemBalances.reduce((sum, row) => sum + row.quantity, 0), 10);
      const events = await transaction.select({ operation: auditEvents.operation })
        .from(auditEvents).where(eq(auditEvents.organizationId, fixture.organization.id));
      assert.ok(events.some((event) => event.operation === "stock.deployed"));
      assert.ok(events.some((event) => event.operation === "stock.returned"));
      throw rollback;
    }), (error) => error === rollback);
  } finally {
    await pool.end();
  }
});

test("C07-AC4/C07-AC5 separate connections serialize withdrawals and deduplicate identical requests", async () => {
  const primary = createDatabase(testUrl());
  const connectionA = createDatabase(testUrl());
  const connectionB = createDatabase(testUrl());
  try {
    const fixture = await primary.db.transaction((transaction) => createFixture(transaction, randomUUID()));
    await receiveStock(fixture.managerContext, {
      officeId: fixture.office.id, locationId: fixture.storage.id, itemId: fixture.item.id,
      quantity: 10, reason: "opening", requestKey: randomUUID(),
    }, primary.db);
    const competing = await Promise.allSettled([
      transferStock(fixture.managerContext, request({
        officeId: fixture.office.id, sourceLocationId: fixture.storage.id, destinationLocationId: fixture.roomLocation.id,
        itemId: fixture.item.id, quantity: 7, intent: "deployment",
      }), connectionA.db),
      transferStock(fixture.managerContext, request({
        officeId: fixture.office.id, sourceLocationId: fixture.storage.id, destinationLocationId: fixture.roomLocation.id,
        itemId: fixture.item.id, quantity: 4, intent: "deployment",
      }), connectionB.db),
    ]);
    assert.equal(competing.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(competing.filter((result) => result.status === "rejected" && result.reason?.code === "CONFLICT").length, 1);

    await Promise.all([
      transferStock(fixture.managerContext, request({
        officeId: fixture.office.id, sourceLocationId: fixture.roomLocation.id, destinationLocationId: fixture.storage.id,
        itemId: fixture.item.id, quantity: 1, intent: "return",
      }), connectionA.db),
      transferStock(fixture.managerContext, request({
        officeId: fixture.office.id, sourceLocationId: fixture.storage.id, destinationLocationId: fixture.roomLocation.id,
        itemId: fixture.item.id, quantity: 1, intent: "deployment",
      }), connectionB.db),
    ]);

    const duplicate = request({
      officeId: fixture.office.id, sourceLocationId: fixture.storage.id, destinationLocationId: fixture.roomLocation.id,
      itemId: fixture.item.id, quantity: 1, intent: "deployment",
    });
    const duplicates = await Promise.all([
      transferStock(fixture.managerContext, duplicate, connectionA.db),
      transferStock(fixture.managerContext, duplicate, connectionB.db),
    ]);
    assert.equal(duplicates[0].transactionId, duplicates[1].transactionId);
    assert.equal(duplicates[0].outgoing.id, duplicates[1].outgoing.id);
    const balances = await primary.db.select({ quantity: stockBalances.quantity }).from(stockBalances)
      .where(and(eq(stockBalances.organizationId, fixture.organization.id), eq(stockBalances.officeId, fixture.office.id), eq(stockBalances.itemId, fixture.item.id)));
    assert.equal(balances.reduce((sum, row) => sum + row.quantity, 0), 10);
    const movements = await primary.db.select({ total: count() }).from(stockMovements)
      .where(and(eq(stockMovements.organizationId, fixture.organization.id), eq(stockMovements.itemId, fixture.item.id)));
    assert.equal(Number(movements[0].total) % 2, 1);
  } finally {
    await Promise.all([primary.pool.end(), connectionA.pool.end(), connectionB.pool.end()]);
  }
});
