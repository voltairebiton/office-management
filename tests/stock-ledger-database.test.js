import "../scripts/env.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, count, eq, sql } from "drizzle-orm";
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
import { updateCatalogItem, archiveItem, archiveLocation } from "../src/lib/catalog-service.js";
import { receiveStock, listStockBalances, listStockMovements } from "../src/lib/stock-service.js";
import { resolveTestDatabaseUrl } from "../scripts/test-database-config.js";

function receipt({ officeId, locationId, itemId, quantity, reason = "replenishment", requestKey = randomUUID(), reference = null }) {
  return { officeId, locationId, itemId, quantity, reason, requestKey, reference };
}

function hasDatabaseCode(error, code) {
  for (let current = error; current; current = current.cause) {
    if (current.code === code) return true;
  }
  return false;
}

async function createFixture(transaction, suffix) {
  const [organization] = await transaction.insert(organizations).values({
    workosOrganizationId: `org_stock_${suffix}`,
    name: "Stock ledger test",
  }).returning();
  const [adminUser, managerUser, employeeUser] = await transaction.insert(users).values([
    { workosUserId: `stock_admin_${suffix}`, email: `stock-admin-${suffix}@example.invalid` },
    { workosUserId: `stock_manager_${suffix}`, email: `stock-manager-${suffix}@example.invalid` },
    { workosUserId: `stock_employee_${suffix}`, email: `stock-employee-${suffix}@example.invalid` },
  ]).returning();
  const [adminMembership, managerMembership, employeeMembership] = await transaction.insert(organizationMemberships).values([
    { organizationId: organization.id, userId: adminUser.id, workosMembershipId: `stock_admin_m_${suffix}`, role: "organization_admin", status: "active" },
    { organizationId: organization.id, userId: managerUser.id, workosMembershipId: `stock_manager_m_${suffix}`, role: "office_manager", status: "active" },
    { organizationId: organization.id, userId: employeeUser.id, workosMembershipId: `stock_employee_m_${suffix}`, role: "employee", status: "active" },
  ]).returning();
  const [office, otherOffice] = await transaction.insert(offices).values([
    { organizationId: organization.id, name: "Stock office", code: `ST-${suffix.slice(0, 8).toUpperCase()}` },
    { organizationId: organization.id, name: "Unassigned office", code: `UN-${suffix.slice(0, 8).toUpperCase()}` },
  ]).returning();
  const [room] = await transaction.insert(rooms).values({
    organizationId: organization.id, officeId: office.id, name: "Room stock test", code: "ROOM1",
  }).returning();
  await transaction.insert(officeAssignments).values({
    organizationId: organization.id, officeId: office.id, membershipId: managerMembership.id, isActive: true,
  });
  const [item] = await transaction.insert(inventoryItems).values({
    organizationId: organization.id, sku: "TISSUE-1", name: "Facial tissues", category: "consumable", unit: "box",
  }).returning();
  const [storageLocation, roomLocation] = await transaction.insert(stockLocations).values([
    { organizationId: organization.id, officeId: office.id, kind: "storage", code: "PANTRY", name: "Pantry" },
    { organizationId: organization.id, officeId: office.id, roomId: room.id, kind: "room", code: "ROOM-TEST", name: room.name },
  ]).returning();
  const adminContext = buildAuthorizationContext({
    actor: { id: adminUser.id }, organization, membership: adminMembership, offices: [office, otherOffice],
  });
  const managerContext = buildAuthorizationContext({
    actor: { id: managerUser.id }, organization, membership: managerMembership,
    offices: [office, otherOffice], officeAssignments: [{
      organizationId: organization.id, officeId: office.id, membershipId: managerMembership.id, isActive: true,
    }],
  });
  const employeeContext = buildAuthorizationContext({
    actor: { id: employeeUser.id }, organization, membership: employeeMembership, offices: [office, otherOffice],
  });
  return { organization, office, otherOffice, room, item, storageLocation, roomLocation, adminContext, managerContext, employeeContext };
}

test("C06 receipts are atomic, scoped, idempotent, and ledger-reconcilable in Postgres", async () => {
  const testDatabaseUrl = resolveTestDatabaseUrl({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    directDatabaseUrl: process.env.DIRECT_DATABASE_URL,
  });
  const { db, pool } = createDatabase(testDatabaseUrl);
  const suffix = randomUUID();
  const rollbackFixture = new Error("ROLLBACK_STOCK_FIXTURE");

  try {
    await assert.rejects(db.transaction(async (transaction) => {
      const fixture = await createFixture(transaction, suffix);
      const firstRequest = receipt({
        officeId: fixture.office.id,
        locationId: fixture.storageLocation.id,
        itemId: fixture.item.id,
        quantity: 7,
        reason: "opening",
        reference: "Opening pantry count",
      });
      const first = await receiveStock(fixture.adminContext, firstRequest, transaction);
      assert.equal(first.balanceAfter, 7);
      assert.equal(first.movement.quantityDelta, 7);
      assert.equal(first.movement.itemSku, fixture.item.sku);
      assert.equal(first.movement.itemUnit, fixture.item.unit);
      assert.equal(first.movement.reason, "opening");

      const repeated = await receiveStock(fixture.adminContext, firstRequest, transaction);
      assert.equal(repeated.transactionId, first.transactionId);
      assert.equal(repeated.movement.id, first.movement.id);
      assert.equal(repeated.replayed, true);
      await assert.rejects(receiveStock(fixture.adminContext, { ...firstRequest, quantity: 8 }, transaction), { code: "CONFLICT" });
      await assert.rejects(receiveStock(fixture.employeeContext, firstRequest, transaction), { code: "FORBIDDEN" });
      await assert.rejects(receiveStock(fixture.managerContext, receipt({
        officeId: fixture.otherOffice.id,
        locationId: fixture.storageLocation.id,
        itemId: fixture.item.id,
        quantity: 1,
      }), transaction), { code: "NOT_FOUND" });
      await assert.rejects(receiveStock(fixture.managerContext, receipt({
        officeId: fixture.office.id,
        locationId: fixture.roomLocation.id,
        itemId: fixture.item.id,
        quantity: 1,
      }), transaction), { code: "VALIDATION" });
      await assert.rejects(receiveStock(fixture.adminContext, receipt({
        officeId: fixture.office.id,
        locationId: fixture.storageLocation.id,
        itemId: randomUUID(),
        quantity: 1,
      }), transaction), { code: "NOT_FOUND" });

      const failedRequest = receipt({
        officeId: fixture.office.id,
        locationId: fixture.storageLocation.id,
        itemId: fixture.item.id,
        quantity: 1,
      });
      await assert.rejects(receiveStock(fixture.adminContext, failedRequest, transaction, {
        afterMovement: async () => { throw new Error("INJECTED_AFTER_MOVEMENT"); },
      }), /INJECTED_AFTER_MOVEMENT/);
      const failedKey = await transaction.select().from(stockTransactions)
        .where(eq(stockTransactions.requestKey, failedRequest.requestKey));
      assert.equal(failedKey.length, 0);
      const [balancesAfterFailure] = await transaction.select({ total: count() }).from(stockBalances)
        .where(and(eq(stockBalances.organizationId, fixture.organization.id), eq(stockBalances.officeId, fixture.office.id)));
      assert.equal(balancesAfterFailure.total, 1);

      await assert.rejects(receiveStock(fixture.adminContext, receipt({
        officeId: fixture.office.id,
        locationId: fixture.storageLocation.id,
        itemId: fixture.item.id,
        quantity: 2_147_483_647,
      }), transaction), { code: "VALIDATION" });
      const { rows: balances } = await listStockBalances(fixture.adminContext, fixture.office.id, {}, transaction);
      const [balance] = balances;
      assert.equal(balance.quantity, 7);
      const movements = await listStockMovements(fixture.adminContext, fixture.office.id, {}, transaction);
      assert.equal(movements.total, 1);
      assert.equal(movements.rows[0].requestKey, firstRequest.requestKey);
      await assert.rejects(transaction.transaction((nested) => nested.update(stockMovements)
        .set({ itemName: "rewritten history" }).where(eq(stockMovements.id, first.movement.id))), (error) => hasDatabaseCode(error, "55000"));
      await assert.rejects(transaction.transaction((nested) => nested.execute(sql`truncate table stock_movements`)), (error) => hasDatabaseCode(error, "55000"));
      await assert.rejects(transaction.transaction((nested) => nested.delete(stockTransactions)
        .where(eq(stockTransactions.id, first.transactionId))), (error) => hasDatabaseCode(error, "55000"));

      await assert.rejects(archiveItem(fixture.adminContext, fixture.item.id, transaction), { code: "CONFLICT" });
      await assert.rejects(archiveLocation(fixture.managerContext, fixture.office.id, fixture.storageLocation.id, transaction), { code: "CONFLICT" });
      await assert.rejects(updateCatalogItem(fixture.adminContext, fixture.item.id, {
        sku: "TISSUE-2", name: fixture.item.name, category: fixture.item.category, unit: fixture.item.unit,
      }, fixture.item.updatedAt, transaction), { code: "CONFLICT" });
      const renamed = await updateCatalogItem(fixture.adminContext, fixture.item.id, {
        sku: fixture.item.sku, name: "Soft facial tissues", category: fixture.item.category, unit: fixture.item.unit,
      }, fixture.item.updatedAt, transaction);
      assert.equal(renamed.name, "Soft facial tissues");
      const movementSnapshot = await transaction.select({ itemName: stockMovements.itemName })
        .from(stockMovements).where(eq(stockMovements.transactionId, first.transactionId));
      assert.equal(movementSnapshot[0].itemName, "Facial tissues");

      const eventRows = await transaction.select({ operation: auditEvents.operation })
        .from(auditEvents).where(eq(auditEvents.organizationId, fixture.organization.id));
      assert.ok(eventRows.some((row) => row.operation === "stock.received"));
      assert.ok(eventRows.some((row) => row.operation === "catalog_item.updated"));
      throw rollbackFixture;
    }), (error) => error === rollbackFixture);
  } finally {
    await pool.end();
  }
});

test("C06-AC4/C06-AC5 separate connections preserve concurrent increments and deduplicate retries", async () => {
  const testDatabaseUrl = resolveTestDatabaseUrl({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    directDatabaseUrl: process.env.DIRECT_DATABASE_URL,
  });
  const primary = createDatabase(testDatabaseUrl);
  const connectionA = createDatabase(testDatabaseUrl);
  const connectionB = createDatabase(testDatabaseUrl);
  let fixture;

  try {
    fixture = await primary.db.transaction((transaction) => createFixture(transaction, randomUUID()));
    const increments = await Promise.all([
      receiveStock(fixture.managerContext, receipt({ officeId: fixture.office.id, locationId: fixture.storageLocation.id, itemId: fixture.item.id, quantity: 4 }), connectionA.db, { writeAudit: async () => {} }),
      receiveStock(fixture.managerContext, receipt({ officeId: fixture.office.id, locationId: fixture.storageLocation.id, itemId: fixture.item.id, quantity: 6 }), connectionB.db, { writeAudit: async () => {} }),
    ]);
    assert.equal(increments.reduce((sum, result) => sum + result.movement.quantityDelta, 0), 10);

    const duplicateRequest = receipt({ officeId: fixture.office.id, locationId: fixture.storageLocation.id, itemId: fixture.item.id, quantity: 3 });
    const duplicates = await Promise.all([
      receiveStock(fixture.managerContext, duplicateRequest, connectionA.db, { writeAudit: async () => {} }),
      receiveStock(fixture.managerContext, duplicateRequest, connectionB.db, { writeAudit: async () => {} }),
    ]);
    assert.equal(duplicates[0].transactionId, duplicates[1].transactionId);
    assert.equal(duplicates[0].movement.id, duplicates[1].movement.id);
    await assert.rejects(receiveStock(fixture.managerContext, { ...duplicateRequest, quantity: 5 }, primary.db, { writeAudit: async () => {} }), { code: "CONFLICT" });

    const [balance] = await primary.db.select().from(stockBalances)
      .where(and(
        eq(stockBalances.organizationId, fixture.organization.id),
        eq(stockBalances.officeId, fixture.office.id),
        eq(stockBalances.locationId, fixture.storageLocation.id),
        eq(stockBalances.itemId, fixture.item.id),
      ));
    assert.equal(balance.quantity, 13);
    const persistedMovements = await primary.db.select({
      movementId: stockMovements.id,
      delta: stockMovements.quantityDelta,
    }).from(stockMovements)
      .where(and(eq(stockMovements.organizationId, fixture.organization.id), eq(stockMovements.itemId, fixture.item.id)));
    assert.equal(persistedMovements.length, 3);
    assert.equal(persistedMovements.reduce((sum, movement) => sum + movement.delta, 0), balance.quantity);
  } finally {
    await Promise.all([primary.pool.end(), connectionA.pool.end(), connectionB.pool.end()]);
  }
});
