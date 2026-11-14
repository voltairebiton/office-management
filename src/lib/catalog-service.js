import "server-only";
import { and, asc, count, eq, gt, ilike, inArray, or } from "drizzle-orm";
import { getDatabase } from "../db/index.js";
import { inventoryItems, offices, rooms, stockBalances, stockLocations, stockMovements } from "../db/schema.js";
import { recordAuditEvent } from "./audit-repository.js";
import { assertCapability } from "./authorization.js";
import { normalizeCatalogItemInput, normalizeStorageLocationInput } from "./catalog-validation.js";
import { parseListOptions } from "./office-validation.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function catalogError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

function assertId(value) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw catalogError("NOT_FOUND", "The requested resource was not found.");
  }
}

function assertOffice(context, capability, officeId) {
  assertId(officeId);
  assertCapability(context, capability, { organizationId: context?.organizationId });
  if (!context?.officeIds?.includes(officeId)) {
    throw catalogError("NOT_FOUND", "The requested resource was not found.");
  }
}

function findDatabaseCode(error, code) {
  for (let current = error; current; current = current.cause) {
    if (current.code === code) return true;
  }
  return false;
}

function mapDatabaseError(error) {
  if (findDatabaseCode(error, "23505")) {
    throw catalogError("CONFLICT", "That code is already in use in this workspace.");
  }
  if (findDatabaseCode(error, "23503")) {
    throw catalogError("NOT_FOUND", "The requested resource was not found.");
  }
  if (findDatabaseCode(error, "23514")) {
    throw catalogError("VALIDATION", "The submitted values are not valid.");
  }
  throw error;
}

function paginationResult(rows, total, options) {
  return {
    rows,
    total: Number(total),
    page: options.page,
    pageSize: options.pageSize,
    totalPages: Math.ceil(Number(total) / options.pageSize),
  };
}

function listStatus(value, label) {
  const status = value ?? "active";
  if (!new Set(["active", "archived", "all"]).has(status)) {
    throw catalogError("VALIDATION", `Choose active, archived, or all ${label}.`);
  }
  return status;
}

function searchExpression(query, columns) {
  if (!query) return null;
  const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  return or(...columns.map((column) => ilike(column, pattern)));
}

function itemSnapshot(item) {
  return {
    sku: item.sku,
    name: item.name,
    category: item.category,
    unit: item.unit,
    isActive: item.isActive,
  };
}

function locationSnapshot(location) {
  return {
    officeId: location.officeId,
    roomId: location.roomId,
    kind: location.kind,
    code: location.code,
    name: location.name,
    isActive: location.isActive,
  };
}

async function lockActiveOffice(transaction, context, officeId) {
  const [office] = await transaction.select().from(offices)
    .where(and(eq(offices.organizationId, context.organizationId), eq(offices.id, officeId)))
    .for("update").limit(1);
  if (!office?.isActive) throw catalogError("NOT_FOUND", "The requested resource was not found.");
  return office;
}

async function lockActiveRoom(transaction, context, officeId, roomId) {
  assertId(roomId);
  const [room] = await transaction.select().from(rooms)
    .where(and(
      eq(rooms.organizationId, context.organizationId),
      eq(rooms.officeId, officeId),
      eq(rooms.id, roomId),
      eq(rooms.isActive, true),
    )).for("update").limit(1);
  if (!room) throw catalogError("NOT_FOUND", "The requested resource was not found.");
  return room;
}

async function lockItem(transaction, context, itemId) {
  assertId(itemId);
  const [item] = await transaction.select().from(inventoryItems)
    .where(and(
      eq(inventoryItems.organizationId, context.organizationId),
      eq(inventoryItems.id, itemId),
    )).for("update").limit(1);
  if (!item) throw catalogError("NOT_FOUND", "The requested resource was not found.");
  return item;
}

function expectedTimestamp(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    throw catalogError("VALIDATION", "Reload this record before saving your changes.");
  }
  return timestamp;
}

export async function listCatalogItems(context, input = {}, database = getDatabase()) {
  assertCapability(context, "inventory:read", { organizationId: context?.organizationId });
  const options = parseListOptions(input);
  const status = listStatus(input.status, "catalog items");
  const conditions = [eq(inventoryItems.organizationId, context.organizationId)];
  if (status === "active") conditions.push(eq(inventoryItems.isActive, true));
  if (status === "archived") conditions.push(eq(inventoryItems.isActive, false));
  const search = searchExpression(options.query, [inventoryItems.sku, inventoryItems.name]);
  if (search) conditions.push(search);
  const [rows, totals] = await Promise.all([
    database.select().from(inventoryItems).where(and(...conditions))
      .orderBy(asc(inventoryItems.sku), asc(inventoryItems.id))
      .limit(options.pageSize).offset(options.offset),
    database.select({ total: count() }).from(inventoryItems).where(and(...conditions)),
  ]);
  return paginationResult(rows, totals[0]?.total ?? 0, options);
}

export async function createCatalogItem(context, input, database = getDatabase()) {
  assertCapability(context, "catalog:manage", { organizationId: context?.organizationId });
  const values = normalizeCatalogItemInput(input);
  try {
    return await database.transaction(async (transaction) => {
      const [item] = await transaction.insert(inventoryItems).values({
        organizationId: context.organizationId,
        ...values,
      }).returning();
      await recordAuditEvent(transaction, context, {
        operation: "catalog_item.created",
        resourceType: "catalog-item",
        resourceId: item.id,
        after: itemSnapshot(item),
      });
      return item;
    });
  } catch (error) {
    return mapDatabaseError(error);
  }
}

export async function updateCatalogItem(context, itemId, input, expectedUpdatedAt, database = getDatabase()) {
  assertCapability(context, "catalog:manage", { organizationId: context?.organizationId });
  assertId(itemId);
  const values = normalizeCatalogItemInput(input);
  const expected = expectedTimestamp(expectedUpdatedAt);
  try {
    return await database.transaction(async (transaction) => {
      const item = await lockItem(transaction, context, itemId);
      if (!item.isActive) throw catalogError("CONFLICT", "Archived catalog items cannot be edited.");
      if (item.updatedAt.getTime() !== expected) {
        throw catalogError("CONFLICT", "This catalog item changed. Reload before saving.");
      }
      const identityChanged = item.sku !== values.sku || item.category !== values.category || item.unit !== values.unit;
      if (identityChanged) {
        const [history] = await transaction.select({ total: count() }).from(stockMovements)
          .where(and(
            eq(stockMovements.organizationId, context.organizationId),
            eq(stockMovements.itemId, item.id),
          ));
        if (Number(history?.total ?? 0) > 0) {
          throw catalogError("CONFLICT", "SKU, category, and base unit are locked after the first stock movement.");
        }
      }
      const [updated] = await transaction.update(inventoryItems)
        .set({ ...values, updatedAt: new Date(Math.max(Date.now(), item.updatedAt.getTime() + 1)) })
        .where(and(eq(inventoryItems.organizationId, context.organizationId), eq(inventoryItems.id, itemId)))
        .returning();
      await recordAuditEvent(transaction, context, {
        operation: "catalog_item.updated",
        resourceType: "catalog-item",
        resourceId: item.id,
        before: itemSnapshot(item),
        after: itemSnapshot(updated),
      });
      return updated;
    });
  } catch (error) {
    return mapDatabaseError(error);
  }
}

export async function archiveItem(context, itemId, database = getDatabase()) {
  assertCapability(context, "catalog:manage", { organizationId: context?.organizationId });
  assertId(itemId);
  return database.transaction(async (transaction) => {
    const item = await lockItem(transaction, context, itemId);
    if (!item.isActive) return item;
    const [balances] = await transaction.select({ total: count() }).from(stockBalances)
      .where(and(
        eq(stockBalances.organizationId, context.organizationId),
        eq(stockBalances.itemId, item.id),
        gt(stockBalances.quantity, 0),
      ));
    if (Number(balances?.total ?? 0) > 0) {
      throw catalogError("CONFLICT", "Move or reconcile stock before archiving this catalog item.", {
        dependents: { locationsWithStock: Number(balances.total) },
      });
    }
    const [archived] = await transaction.update(inventoryItems)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(inventoryItems.organizationId, context.organizationId), eq(inventoryItems.id, itemId)))
      .returning();
    await recordAuditEvent(transaction, context, {
      operation: "catalog_item.archived",
      resourceType: "catalog-item",
      resourceId: item.id,
      before: itemSnapshot(item),
      after: itemSnapshot(archived),
    });
    return archived;
  });
}

export async function listStockLocations(context, officeId, input = {}, database = getDatabase()) {
  assertOffice(context, "inventory:read", officeId);
  const options = parseListOptions(input);
  const status = listStatus(input.status, "stock locations");
  const kind = input.kind ?? "all";
  if (!new Set(["storage", "room", "all"]).has(kind)) {
    throw catalogError("VALIDATION", "Choose storage, room, or all location types.");
  }
  const roomIds = input.roomIds;
  if (roomIds !== undefined && (!Array.isArray(roomIds) || roomIds.length > 50)) {
    throw catalogError("VALIDATION", "Choose at most 50 room locations at a time.");
  }
  if (roomIds) for (const roomId of roomIds) assertId(roomId);
  if (roomIds?.length === 0) return paginationResult([], 0, options);
  const conditions = [
    eq(stockLocations.organizationId, context.organizationId),
    eq(stockLocations.officeId, officeId),
    eq(offices.isActive, true),
  ];
  if (kind !== "all") conditions.push(eq(stockLocations.kind, kind));
  if (roomIds) conditions.push(inArray(stockLocations.roomId, roomIds));
  if (status === "active") {
    conditions.push(eq(stockLocations.isActive, true));
    conditions.push(or(eq(stockLocations.kind, "storage"), eq(rooms.isActive, true)));
  }
  if (status === "archived") conditions.push(eq(stockLocations.isActive, false));
  const search = searchExpression(options.query, [stockLocations.code, stockLocations.name, rooms.name]);
  if (search) conditions.push(search);
  const fromQuery = (select) => select.from(stockLocations)
    .innerJoin(offices, and(
      eq(offices.organizationId, stockLocations.organizationId),
      eq(offices.id, stockLocations.officeId),
    ))
    .leftJoin(rooms, and(
      eq(rooms.organizationId, stockLocations.organizationId),
      eq(rooms.officeId, stockLocations.officeId),
      eq(rooms.id, stockLocations.roomId),
    ))
    .where(and(...conditions));
  const [rows, totals] = await Promise.all([
    fromQuery(database.select({
      id: stockLocations.id,
      officeId: stockLocations.officeId,
      roomId: stockLocations.roomId,
      kind: stockLocations.kind,
      code: stockLocations.code,
      name: stockLocations.name,
      isActive: stockLocations.isActive,
      roomName: rooms.name,
      updatedAt: stockLocations.updatedAt,
    })).orderBy(asc(stockLocations.kind), asc(stockLocations.code), asc(stockLocations.id))
      .limit(options.pageSize).offset(options.offset),
    fromQuery(database.select({ total: count() })),
  ]);
  return paginationResult(rows, totals[0]?.total ?? 0, options);
}

export async function createStorageLocation(context, officeId, input, database = getDatabase()) {
  assertOffice(context, "inventory:manage", officeId);
  const values = normalizeStorageLocationInput(input);
  try {
    return await database.transaction(async (transaction) => {
      await lockActiveOffice(transaction, context, officeId);
      const [location] = await transaction.insert(stockLocations).values({
        organizationId: context.organizationId,
        officeId,
        kind: "storage",
        ...values,
      }).returning();
      await recordAuditEvent(transaction, context, {
        operation: "stock_location.created",
        resourceType: "stock-location",
        resourceId: location.id,
        officeId,
        after: locationSnapshot(location),
      });
      return location;
    });
  } catch (error) {
    return mapDatabaseError(error);
  }
}

export async function ensureRoomLocation(context, officeId, roomId, database = getDatabase()) {
  assertOffice(context, "inventory:manage", officeId);
  assertId(roomId);
  try {
    return await database.transaction(async (transaction) => {
      await lockActiveOffice(transaction, context, officeId);
      const room = await lockActiveRoom(transaction, context, officeId, roomId);
      const [existing] = await transaction.select().from(stockLocations)
        .where(and(
          eq(stockLocations.organizationId, context.organizationId),
          eq(stockLocations.officeId, officeId),
          eq(stockLocations.roomId, roomId),
        )).for("update").limit(1);
      if (existing) {
        if (!existing.isActive) throw catalogError("CONFLICT", "This room stock location is archived.");
        return existing;
      }
      const [location] = await transaction.insert(stockLocations).values({
        organizationId: context.organizationId,
        officeId,
        roomId,
        kind: "room",
        code: `ROOM-${room.id.replaceAll("-", "").toUpperCase()}`,
        name: room.name,
      }).returning();
      await recordAuditEvent(transaction, context, {
        operation: "stock_location.room_created",
        resourceType: "stock-location",
        resourceId: location.id,
        officeId,
        after: locationSnapshot(location),
      });
      return location;
    });
  } catch (error) {
    return mapDatabaseError(error);
  }
}

async function lockLocation(transaction, context, officeId, locationId) {
  assertId(locationId);
  const [location] = await transaction.select().from(stockLocations)
    .where(and(
      eq(stockLocations.organizationId, context.organizationId),
      eq(stockLocations.officeId, officeId),
      eq(stockLocations.id, locationId),
    )).for("update").limit(1);
  if (!location) throw catalogError("NOT_FOUND", "The requested resource was not found.");
  return location;
}

export async function updateStorageLocation(context, officeId, locationId, input, expectedUpdatedAt, database = getDatabase()) {
  assertOffice(context, "inventory:manage", officeId);
  const values = normalizeStorageLocationInput(input);
  const expected = expectedTimestamp(expectedUpdatedAt);
  try {
    return await database.transaction(async (transaction) => {
      await lockActiveOffice(transaction, context, officeId);
      const location = await lockLocation(transaction, context, officeId, locationId);
      if (location.kind !== "storage") throw catalogError("VALIDATION", "Room locations are managed with their room.");
      if (!location.isActive) throw catalogError("CONFLICT", "Archived locations cannot be edited.");
      if (location.updatedAt.getTime() !== expected) {
        throw catalogError("CONFLICT", "This stock location changed. Reload before saving.");
      }
      const [updated] = await transaction.update(stockLocations)
        .set({ ...values, updatedAt: new Date(Math.max(Date.now(), location.updatedAt.getTime() + 1)) })
        .where(and(
          eq(stockLocations.organizationId, context.organizationId),
          eq(stockLocations.officeId, officeId),
          eq(stockLocations.id, locationId),
        )).returning();
      await recordAuditEvent(transaction, context, {
        operation: "stock_location.updated",
        resourceType: "stock-location",
        resourceId: location.id,
        officeId,
        before: locationSnapshot(location),
        after: locationSnapshot(updated),
      });
      return updated;
    });
  } catch (error) {
    return mapDatabaseError(error);
  }
}

export async function archiveLocation(context, officeId, locationId, database = getDatabase()) {
  assertOffice(context, "inventory:manage", officeId);
  assertId(locationId);
  return database.transaction(async (transaction) => {
    await lockActiveOffice(transaction, context, officeId);
    const location = await lockLocation(transaction, context, officeId, locationId);
    if (!location.isActive) return location;
    const [balances] = await transaction.select({ total: count() }).from(stockBalances)
      .where(and(
        eq(stockBalances.organizationId, context.organizationId),
        eq(stockBalances.officeId, officeId),
        eq(stockBalances.locationId, location.id),
        gt(stockBalances.quantity, 0),
      ));
    if (Number(balances?.total ?? 0) > 0) {
      throw catalogError("CONFLICT", "Move or reconcile stock before archiving this location.", {
        dependents: { itemsWithStock: Number(balances.total) },
      });
    }
    const [archived] = await transaction.update(stockLocations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(stockLocations.organizationId, context.organizationId),
        eq(stockLocations.officeId, officeId),
        eq(stockLocations.id, locationId),
      )).returning();
    await recordAuditEvent(transaction, context, {
      operation: "stock_location.archived",
      resourceType: "stock-location",
      resourceId: location.id,
      officeId,
      before: locationSnapshot(location),
      after: locationSnapshot(archived),
    });
    return archived;
  });
}
