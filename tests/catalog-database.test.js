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
  stockLocations,
  users,
} from "../src/db/schema.js";
import { buildAuthorizationContext } from "../src/lib/authorization.js";
import {
  archiveItem,
  archiveLocation,
  createCatalogItem,
  createStorageLocation,
  ensureRoomLocation,
  listCatalogItems,
  listStockLocations,
  updateCatalogItem,
  updateStorageLocation,
} from "../src/lib/catalog-service.js";
import { resolveTestDatabaseUrl } from "../scripts/test-database-config.js";

test("C05 catalog and location services enforce tenant/office scope, idempotency, audit, and archive policy", async () => {
  const testDatabaseUrl = resolveTestDatabaseUrl({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    directDatabaseUrl: process.env.DIRECT_DATABASE_URL,
  });
  const { db, pool } = createDatabase(testDatabaseUrl);
  const suffix = randomUUID();
  const rollbackFixture = new Error("ROLLBACK_CATALOG_FIXTURE");

  try {
    await assert.rejects(db.transaction(async (transaction) => {
      const [organization, foreignOrganization] = await transaction.insert(organizations).values([
        { workosOrganizationId: `org_catalog_${suffix}`, name: "Catalog tenant" },
        { workosOrganizationId: `org_catalog_foreign_${suffix}`, name: "Other catalog tenant" },
      ]).returning();
      const [adminUser, managerUser, foreignUser] = await transaction.insert(users).values([
        { workosUserId: `catalog_admin_${suffix}`, email: `catalog-admin-${suffix}@example.invalid` },
        { workosUserId: `catalog_manager_${suffix}`, email: `catalog-manager-${suffix}@example.invalid` },
        { workosUserId: `catalog_foreign_${suffix}`, email: `catalog-foreign-${suffix}@example.invalid` },
      ]).returning();
      const [adminMembership, managerMembership, foreignMembership] = await transaction.insert(organizationMemberships).values([
        { organizationId: organization.id, userId: adminUser.id, workosMembershipId: `catalog_admin_m_${suffix}`, role: "organization_admin", status: "active" },
        { organizationId: organization.id, userId: managerUser.id, workosMembershipId: `catalog_manager_m_${suffix}`, role: "office_manager", status: "active" },
        { organizationId: foreignOrganization.id, userId: foreignUser.id, workosMembershipId: `catalog_foreign_m_${suffix}`, role: "organization_admin", status: "active" },
      ]).returning();
      const [office, otherOffice] = await transaction.insert(offices).values([
        { organizationId: organization.id, name: "Catalog office", code: `CAT-${suffix.slice(0, 8).toUpperCase()}` },
        { organizationId: organization.id, name: "Other office", code: `OTH-${suffix.slice(0, 8).toUpperCase()}` },
      ]).returning();
      const [foreignOffice] = await transaction.insert(offices).values({
        organizationId: foreignOrganization.id,
        name: "Foreign office",
        code: `FOR-${suffix.slice(0, 8).toUpperCase()}`,
      }).returning();
      const [room, otherOfficeRoom, foreignRoom] = await transaction.insert(rooms).values([
        { organizationId: organization.id, officeId: office.id, name: "Supply room", code: "SUPPLY" },
        { organizationId: organization.id, officeId: otherOffice.id, name: "Other room", code: "OTHER" },
        { organizationId: foreignOrganization.id, officeId: foreignOffice.id, name: "Foreign room", code: "FOREIGN" },
      ]).returning();
      await transaction.insert(officeAssignments).values({
        organizationId: organization.id,
        officeId: office.id,
        membershipId: managerMembership.id,
        isActive: true,
      });
      const adminContext = buildAuthorizationContext({
        actor: { id: adminUser.id }, organization, membership: adminMembership, offices: [office, otherOffice],
      });
      const managerContext = buildAuthorizationContext({
        actor: { id: managerUser.id }, organization, membership: managerMembership,
        offices: [office, otherOffice], officeAssignments: [{
          organizationId: organization.id, officeId: office.id, membershipId: managerMembership.id, isActive: true,
        }],
      });
      const foreignContext = buildAuthorizationContext({
        actor: { id: foreignUser.id }, organization: foreignOrganization, membership: foreignMembership, offices: [foreignOffice],
      });

      const item = await createCatalogItem(adminContext, {
        sku: "  tissue-1 ", name: " Facial tissues ", category: "consumable", unit: " Box ",
      }, transaction);
      assert.equal(item.sku, "TISSUE-1");
      assert.equal(item.unit, "box");
      assert.equal((await listCatalogItems(managerContext, { q: "tissue" }, transaction)).total, 1);
      await assert.rejects(createCatalogItem(managerContext, {
        sku: "CHAIR-1", name: "Chair", category: "reusable", unit: "piece",
      }, transaction), { code: "FORBIDDEN" });
      const foreignItem = await createCatalogItem(foreignContext, {
        sku: "TISSUE-1", name: "Foreign tissue", category: "consumable", unit: "box",
      }, transaction);
      assert.equal(foreignItem.sku, item.sku);
      assert.equal(foreignItem.organizationId, foreignOrganization.id);

      const location = await createStorageLocation(managerContext, office.id, {
        code: "pantry", name: "Pantry",
      }, transaction);
      await assert.rejects(createStorageLocation(managerContext, office.id, {
        code: "PANTRY", name: "Duplicate pantry",
      }, transaction), { code: "CONFLICT" });
      await assert.rejects(createStorageLocation(managerContext, otherOffice.id, {
        code: "STORE", name: "Unauthorized store",
      }, transaction), { code: "NOT_FOUND" });
      await assert.rejects(createStorageLocation(managerContext, foreignOffice.id, {
        code: "FOREIGN", name: "Foreign store",
      }, transaction), { code: "NOT_FOUND" });
      const roomLocation = await ensureRoomLocation(managerContext, office.id, room.id, transaction);
      const repeatedRoomLocation = await ensureRoomLocation(managerContext, office.id, room.id, transaction);
      assert.equal(repeatedRoomLocation.id, roomLocation.id);
      await assert.rejects(ensureRoomLocation(managerContext, office.id, otherOfficeRoom.id, transaction), { code: "NOT_FOUND" });
      await assert.rejects(ensureRoomLocation(managerContext, office.id, foreignRoom.id, transaction), { code: "NOT_FOUND" });
      const [roomLocationCount] = await transaction.select({ total: count() }).from(stockLocations)
        .where(and(eq(stockLocations.organizationId, organization.id), eq(stockLocations.roomId, room.id)));
      assert.equal(roomLocationCount.total, 1);
      assert.equal((await listStockLocations(managerContext, office.id, {}, transaction)).total, 2);

      const updatedItem = await updateCatalogItem(adminContext, item.id, {
        sku: "TISSUE-2", name: "Facial tissues", category: "consumable", unit: "box",
      }, item.updatedAt, transaction);
      await assert.rejects(updateCatalogItem(adminContext, item.id, {
        sku: "TISSUE-3", name: "Facial tissues", category: "consumable", unit: "box",
      }, item.updatedAt, transaction), { code: "CONFLICT" });
      const updatedLocation = await updateStorageLocation(managerContext, office.id, location.id, {
        code: "PANTRY-1", name: "Office pantry",
      }, location.updatedAt, transaction);
      assert.equal(updatedLocation.code, "PANTRY-1");
      await assert.rejects(updateStorageLocation(managerContext, office.id, roomLocation.id, {
        code: "ROOM", name: "Room stock",
      }, roomLocation.updatedAt, transaction), { code: "VALIDATION" });
      assert.equal(updatedItem.sku, "TISSUE-2");

      const archivedItem = await archiveItem(adminContext, item.id, transaction);
      assert.equal(archivedItem.isActive, false);
      assert.equal((await listCatalogItems(adminContext, { status: "active" }, transaction)).total, 0);
      assert.equal((await listCatalogItems(adminContext, { status: "archived" }, transaction)).total, 1);
      assert.equal((await archiveItem(adminContext, item.id, transaction)).id, item.id);
      assert.equal((await archiveLocation(managerContext, office.id, location.id, transaction)).isActive, false);
      assert.equal((await archiveLocation(managerContext, office.id, location.id, transaction)).id, location.id);
      const auditRows = await transaction.select({ operation: auditEvents.operation }).from(auditEvents)
        .where(eq(auditEvents.organizationId, organization.id));
      assert.ok(auditRows.some((row) => row.operation === "catalog_item.created"));
      assert.ok(auditRows.some((row) => row.operation === "stock_location.room_created"));
      assert.ok(auditRows.some((row) => row.operation === "stock_location.archived"));
      throw rollbackFixture;
    }), (error) => error === rollbackFixture);
  } finally {
    await pool.end();
  }
});
