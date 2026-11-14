import "../scripts/env.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { and, count, eq, sum } from "drizzle-orm";
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
import { adjustStock } from "../src/lib/adjustment-service.js";
import { listStockMovements, receiveStock } from "../src/lib/stock-service.js";
import { transferStock } from "../src/lib/transfer-service.js";
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
    workosOrganizationId: "org_adjustment_" + suffix,
    name: "Adjustment test",
  }).returning();
  const [adminUser, managerUser, employeeUser] = await transaction.insert(users).values([
    { workosUserId: "adjustment_admin_" + suffix, email: "adjustment-admin-" + suffix + "@example.invalid" },
    { workosUserId: "adjustment_manager_" + suffix, email: "adjustment-manager-" + suffix + "@example.invalid" },
    { workosUserId: "adjustment_employee_" + suffix, email: "adjustment-employee-" + suffix + "@example.invalid" },
  ]).returning();
  const [adminMembership, managerMembership, employeeMembership] = await transaction.insert(organizationMemberships).values([
    { organizationId: organization.id, userId: adminUser.id, workosMembershipId: "adjustment_admin_m_" + suffix, role: "organization_admin", status: "active" },
    { organizationId: organization.id, userId: managerUser.id, workosMembershipId: "adjustment_manager_m_" + suffix, role: "office_manager", status: "active" },
    { organizationId: organization.id, userId: employeeUser.id, workosMembershipId: "adjustment_employee_m_" + suffix, role: "employee", status: "active" },
  ]).returning();
  const [office, otherOffice] = await transaction.insert(offices).values([
    { organizationId: organization.id, name: "Adjustment office", code: "AD-" + suffix.slice(0, 8).toUpperCase() },
    { organizationId: organization.id, name: "Other office", code: "AO-" + suffix.slice(0, 8).toUpperCase() },
  ]).returning();
  const [room] = await transaction.insert(rooms).values({
    organizationId: organization.id, officeId: office.id, name: "Meeting room", code: "MEET-1",
  }).returning();
  await transaction.insert(officeAssignments).values({
    organizationId: organization.id, officeId: office.id, membershipId: managerMembership.id, isActive: true,
  });
  const [tissue, chair] = await transaction.insert(inventoryItems).values([
    { organizationId: organization.id, sku: "TISSUE-1", name: "Facial tissues", category: "consumable", unit: "box" },
    { organizationId: organization.id, sku: "CHAIR-1", name: "Visitor chair", category: "reusable", unit: "piece" },
  ]).returning();
  const [storage, roomLocation] = await transaction.insert(stockLocations).values([
    { organizationId: organization.id, officeId: office.id, kind: "storage", code: "PANTRY", name: "Main pantry" },
    { organizationId: organization.id, officeId: office.id, roomId: room.id, kind: "room", code: "ROOM-1", name: room.name },
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
  return { organization, office, otherOffice, tissue, chair, storage, roomLocation, adminContext, managerContext, employeeContext };
}

function adjustment(fixture, values) {
  return {
    officeId: fixture.office.id,
    locationId: fixture.storage.id,
    itemId: fixture.tissue.id,
    requestKey: randomUUID(),
    ...values,
  };
}

test("C08 adjustments reconcile, reject stale or unauthorized changes, and record zero-count audit snapshots", async () => {
  const { db, pool } = createDatabase(testUrl());
  const rollback = new Error("ROLLBACK_ADJUSTMENT_FIXTURE");
  try {
    await assert.rejects(db.transaction(async (transaction) => {
      const fixture = await createFixture(transaction, randomUUID());
      await receiveStock(fixture.adminContext, {
        officeId: fixture.office.id, locationId: fixture.storage.id, itemId: fixture.tissue.id,
        quantity: 10, reason: "opening", requestKey: randomUUID(),
      }, transaction);
      await receiveStock(fixture.adminContext, {
        officeId: fixture.office.id, locationId: fixture.storage.id, itemId: fixture.chair.id,
        quantity: 10, reason: "opening", requestKey: randomUUID(),
      }, transaction);

      const consumed = await adjustStock(fixture.managerContext, adjustment(fixture, {
        operation: "consumption", quantity: 2, reason: "Used for the visitor meeting",
      }), transaction);
      assert.equal(consumed.quantityBefore, 10);
      assert.equal(consumed.quantityAfter, 8);
      assert.equal(consumed.quantityDelta, -2);
      assert.equal(consumed.movement.itemUnit, "box");
      await assert.rejects(adjustStock(fixture.managerContext, {
        officeId: fixture.office.id, locationId: fixture.storage.id, itemId: fixture.chair.id,
        requestKey: randomUUID(), operation: "consumption", quantity: 1, reason: "Chair used",
      }, transaction), { code: "VALIDATION" });

      const damaged = await adjustStock(fixture.managerContext, adjustment(fixture, {
        operation: "damage", quantity: 1, reason: "Water-damaged box",
      }), transaction);
      assert.equal(damaged.quantityAfter, 7);
      assert.equal(damaged.movement.movementType, "damage");
      await assert.rejects(adjustStock(fixture.managerContext, adjustment(fixture, {
        operation: "count_correction", countedQuantity: 8, expectedVersion: 2, reason: "Old count",
      }), transaction), { code: "CONFLICT" });

      const reversalRequest = adjustment(fixture, {
        operation: "count_correction", countedQuantity: 8, expectedVersion: 3,
        reason: "Reverse the damaged box entry", reversalOfMovementId: damaged.movement.id,
      });
      const reversal = await adjustStock(fixture.managerContext, reversalRequest, transaction);
      assert.equal(reversal.quantityBefore, 7);
      assert.equal(reversal.quantityAfter, 8);
      assert.equal(reversal.quantityDelta, 1);
      assert.equal(reversal.movement.reversalOfMovementId, damaged.movement.id);
      const replayedReversal = await adjustStock(fixture.managerContext, reversalRequest, transaction);
      assert.equal(replayedReversal.transactionId, reversal.transactionId);
      assert.equal(replayedReversal.movement.id, reversal.movement.id);
      assert.equal(replayedReversal.replayed, true);

      const zeroCountRequest = adjustment(fixture, {
        operation: "count_correction", countedQuantity: 8, expectedVersion: 4, reason: "Count confirmed",
      });
      const zeroCount = await adjustStock(fixture.managerContext, zeroCountRequest, transaction);
      assert.equal(zeroCount.quantityDelta, 0);
      assert.equal(zeroCount.movement, null);
      assert.equal(zeroCount.balanceVersion, 4);
      const [zeroHeader] = await transaction.select().from(stockTransactions)
        .where(eq(stockTransactions.requestKey, zeroCountRequest.requestKey));
      assert.equal(zeroHeader.quantityBefore, 8);
      assert.equal(zeroHeader.quantityAfter, 8);
      assert.equal(zeroHeader.balanceVersion, 4);
      const [zeroMovements] = await transaction.select({ total: count() }).from(stockMovements)
        .where(eq(stockMovements.transactionId, zeroHeader.id));
      assert.equal(Number(zeroMovements.total), 0);
      const zeroReplay = await adjustStock(fixture.managerContext, zeroCountRequest, transaction);
      assert.equal(zeroReplay.replayed, true);
      assert.equal(zeroReplay.movement, null);

      const failed = adjustment(fixture, { operation: "damage", quantity: 1, reason: "Broken in storage" });
      await assert.rejects(adjustStock(fixture.managerContext, failed, transaction, {
        afterMovement: async () => { throw new Error("INJECTED_ADJUSTMENT_FAILURE"); },
      }), /INJECTED_ADJUSTMENT_FAILURE/);
      const failedHeader = await transaction.select().from(stockTransactions)
        .where(eq(stockTransactions.requestKey, failed.requestKey));
      assert.equal(failedHeader.length, 0);
      const retried = await adjustStock(fixture.managerContext, failed, transaction);
      assert.equal(retried.quantityBefore, 8);
      assert.equal(retried.quantityAfter, 7);
      assert.equal(retried.balanceVersion, 5);
      await assert.rejects(adjustStock(fixture.managerContext, adjustment(fixture, {
        operation: "consumption", quantity: 8, reason: "Too many used",
      }), transaction), { code: "CONFLICT" });
      await assert.rejects(adjustStock(fixture.employeeContext, adjustment(fixture, {
        operation: "damage", quantity: 1, reason: "Not authorized",
      }), transaction), { code: "FORBIDDEN" });
      await assert.rejects(adjustStock(fixture.managerContext, adjustment(fixture, {
        operation: "count_correction", countedQuantity: 8, expectedVersion: 0, reason: "Blank version",
      }), transaction), { code: "CONFLICT" });

      const [balance] = await transaction.select().from(stockBalances)
        .where(and(eq(stockBalances.organizationId, fixture.organization.id), eq(stockBalances.officeId, fixture.office.id), eq(stockBalances.locationId, fixture.storage.id), eq(stockBalances.itemId, fixture.tissue.id)));
      const [ledger] = await transaction.select({ total: sum(stockMovements.quantityDelta) })
        .from(stockMovements).where(and(
          eq(stockMovements.organizationId, fixture.organization.id),
          eq(stockMovements.officeId, fixture.office.id),
          eq(stockMovements.locationId, fixture.storage.id),
          eq(stockMovements.itemId, fixture.tissue.id),
        ));
      assert.equal(Number(ledger.total), balance.quantity);
      assert.equal(balance.quantity, 7);
      const history = await listStockMovements(fixture.managerContext, fixture.office.id, {}, transaction);
      assert.ok(history.rows.some((movement) => movement.reversalOfMovementId === damaged.movement.id));
      const events = await transaction.select({ operation: auditEvents.operation, after: auditEvents.after })
        .from(auditEvents).where(eq(auditEvents.organizationId, fixture.organization.id));
      assert.ok(events.some((event) => event.operation === "stock.count_corrected" && event.after?.quantityDelta === 0));
      throw rollback;
    }), (error) => error === rollback);
  } finally {
    await pool.end();
  }
});

test("C08-AC4/C08-AC5 count correction races transfers and competing reductions safely", async () => {
  const primary = createDatabase(testUrl());
  const connectionA = createDatabase(testUrl());
  const connectionB = createDatabase(testUrl());
  try {
    const fixture = await primary.db.transaction((transaction) => createFixture(transaction, randomUUID()));
    await receiveStock(fixture.managerContext, {
      officeId: fixture.office.id, locationId: fixture.storage.id, itemId: fixture.tissue.id,
      quantity: 5, reason: "opening", requestKey: randomUUID(),
    }, primary.db);
    const race = await Promise.allSettled([
      transferStock(fixture.managerContext, {
        officeId: fixture.office.id, sourceLocationId: fixture.storage.id, destinationLocationId: fixture.roomLocation.id,
        itemId: fixture.tissue.id, quantity: 3, intent: "deployment", requestKey: randomUUID(),
      }, connectionA.db),
      adjustStock(fixture.managerContext, {
        officeId: fixture.office.id, locationId: fixture.storage.id, itemId: fixture.tissue.id,
        operation: "count_correction", countedQuantity: 5, expectedVersion: 1, reason: "Count before deployment",
        requestKey: randomUUID(),
      }, connectionB.db),
    ]);
    assert.equal(race[0].status, "fulfilled");
    assert.ok(race[1].status === "fulfilled" || race[1].reason?.code === "CONFLICT");
    if (race[1].status === "fulfilled") assert.equal(race[1].value.quantityDelta, 0);

    const reductions = await Promise.allSettled([
      adjustStock(fixture.managerContext, {
        officeId: fixture.office.id, locationId: fixture.storage.id, itemId: fixture.tissue.id,
        operation: "consumption", quantity: 2, reason: "Used supplies", requestKey: randomUUID(),
      }, connectionA.db),
      adjustStock(fixture.managerContext, {
        officeId: fixture.office.id, locationId: fixture.storage.id, itemId: fixture.tissue.id,
        operation: "damage", quantity: 1, reason: "Damaged supplies", requestKey: randomUUID(),
      }, connectionB.db),
    ]);
    assert.equal(reductions.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(reductions.filter((result) => result.status === "rejected" && result.reason?.code === "CONFLICT").length, 1);
    const balances = await primary.db.select({ quantity: stockBalances.quantity }).from(stockBalances)
      .where(and(eq(stockBalances.organizationId, fixture.organization.id), eq(stockBalances.officeId, fixture.office.id), eq(stockBalances.itemId, fixture.tissue.id)));
    assert.ok(balances.every((balance) => balance.quantity >= 0));
    const [ledger] = await primary.db.select({ total: sum(stockMovements.quantityDelta) })
      .from(stockMovements).where(and(
        eq(stockMovements.organizationId, fixture.organization.id),
        eq(stockMovements.officeId, fixture.office.id),
        eq(stockMovements.itemId, fixture.tissue.id),
      ));
    assert.equal(balances.reduce((sumValue, balance) => sumValue + balance.quantity, 0), Number(ledger.total));
  } finally {
    await Promise.all([primary.pool.end(), connectionA.pool.end(), connectionB.pool.end()]);
  }
});
