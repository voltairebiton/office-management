import "server-only";
import { and, asc, count, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.js";
import { officeAssignments, offices, roomAssignments, rooms } from "../db/schema.js";
import { recordAuditEvent } from "./audit-repository.js";
import { assertCapability } from "./authorization.js";
import { normalizeOfficeInput, normalizeRoomInput, parseListOptions } from "./office-validation.js";

function serviceError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertResourceId(value) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw serviceError("NOT_FOUND", "The requested resource was not found.");
  }
}

function isDatabaseConstraintError(error, code) {
  for (let current = error; current; current = current.cause) {
    if (current.code === code) return true;
  }
  return false;
}

function mapDatabaseError(error) {
  if (isDatabaseConstraintError(error, "23505")) {
    return serviceError("CONFLICT", "That code is already in use in this location.");
  }
  throw error;
}

function officeSnapshot(office) {
  return {
    name: office.name,
    code: office.code,
    timezone: office.timezone,
    isActive: office.isActive,
  };
}

function roomSnapshot(room) {
  return {
    name: room.name,
    code: room.code,
    capacity: room.capacity,
    isActive: room.isActive,
  };
}

function assertOfficeScope(context, capability, officeId, { allowArchived = false } = {}) {
  assertResourceId(officeId);
  assertCapability(context, capability, { organizationId: context?.organizationId });
  if (
    !context?.officeIds?.includes(officeId) &&
    !(allowArchived && context?.role === "organization_admin")
  ) {
    throw serviceError("NOT_FOUND", "The requested resource was not found.");
  }
}

async function findOffice(database, context, officeId, { lock = false } = {}) {
  let query = database
    .select()
    .from(offices)
    .where(and(eq(offices.organizationId, context.organizationId), eq(offices.id, officeId)))
    .limit(1);
  if (lock) query = query.for("update");
  const [office] = await query;
  if (!office) throw serviceError("NOT_FOUND", "The requested resource was not found.");
  return office;
}

function searchCondition(table, query, fields) {
  if (!query) return undefined;
  const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  return or(...fields.map((field) => ilike(table[field], pattern)));
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

export async function listOffices(context, input = {}, database = getDatabase()) {
  assertCapability(context, "offices:read", { organizationId: context?.organizationId });
  const options = parseListOptions(input);
  const visibleIds = context.officeIds ?? [];
  const status = input.status ?? "active";
  if (!new Set(["active", "archived", "all"]).has(status)) {
    throw serviceError("VALIDATION", "Choose active, archived, or all offices.");
  }
  const isAdmin = context.role === "organization_admin";
  if (status === "archived" && !isAdmin) return paginationResult([], 0, options);
  const includeArchived = isAdmin && status !== "active";
  if (!visibleIds.length && !includeArchived) return paginationResult([], 0, options);
  const conditions = [eq(offices.organizationId, context.organizationId)];
  if (!includeArchived) conditions.push(inArray(offices.id, visibleIds));
  if (status === "active") conditions.push(eq(offices.isActive, true));
  if (status === "archived") conditions.push(eq(offices.isActive, false));
  const search = searchCondition(offices, options.query, ["name", "code"]);
  if (search) conditions.push(search);

  const [rows, totals] = await Promise.all([
    database.select().from(offices).where(and(...conditions))
      .orderBy(asc(offices.name), asc(offices.id))
      .limit(options.pageSize).offset(options.offset),
    database.select({ total: count() }).from(offices).where(and(...conditions)),
  ]);
  return paginationResult(rows, totals[0]?.total ?? 0, options);
}
export async function getOffice(context, officeId, { includeArchived = false } = {}, database = getDatabase()) {
  assertOfficeScope(context, "offices:read", officeId, { allowArchived: includeArchived });
  const [office] = await database
    .select()
    .from(offices)
    .where(and(eq(offices.organizationId, context.organizationId), eq(offices.id, officeId)))
    .limit(1);
  if (!office) throw serviceError("NOT_FOUND", "The requested resource was not found.");
  if (!office.isActive && !(includeArchived && context.role === "organization_admin")) {
    throw serviceError("NOT_FOUND", "The requested resource was not found.");
  }
  return office;
}

export async function createOffice(context, input, database = getDatabase()) {
  assertCapability(context, "offices:manage", { organizationId: context?.organizationId });
  const values = normalizeOfficeInput(input);
  try {
    return await database.transaction(async (transaction) => {
      const [office] = await transaction.insert(offices).values({
        organizationId: context.organizationId,
        ...values,
      }).returning();
      await recordAuditEvent(transaction, context, {
        operation: "office.created",
        resourceType: "office",
        resourceId: office.id,
        after: officeSnapshot(office),
      });
      return office;
    });
  } catch (error) {
    return mapDatabaseError(error);
  }
}

export async function updateOffice(context, officeId, input, expectedUpdatedAt, database = getDatabase()) {
  assertResourceId(officeId);
  assertCapability(context, "offices:manage", { organizationId: context?.organizationId });
  const values = normalizeOfficeInput(input);
  const expectedTime = new Date(expectedUpdatedAt).getTime();
  if (!Number.isFinite(expectedTime)) {
    throw serviceError("VALIDATION", "Reload the office before saving your changes.");
  }
  try {
    return await database.transaction(async (transaction) => {
      const [office] = await transaction.select().from(offices)
        .where(and(eq(offices.organizationId, context.organizationId), eq(offices.id, officeId)))
        .for("update").limit(1);
      if (!office || !context.officeIds.includes(officeId)) {
        throw serviceError("NOT_FOUND", "The requested resource was not found.");
      }
      if (!office.isActive) throw serviceError("CONFLICT", "Archived offices cannot be edited.");
      if (new Date(office.updatedAt).getTime() !== expectedTime) {
        throw serviceError("CONFLICT", "This office changed since you opened it. Reload before saving.");
      }
      const [updated] = await transaction.update(offices)
        .set({ ...values, updatedAt: new Date(Math.max(Date.now(), office.updatedAt.getTime() + 1)) })
        .where(and(eq(offices.organizationId, context.organizationId), eq(offices.id, officeId)))
        .returning();
      await recordAuditEvent(transaction, context, {
        operation: "office.updated",
        resourceType: "office",
        resourceId: office.id,
        officeId: office.id,
        before: officeSnapshot(office),
        after: officeSnapshot(updated),
      });
      return updated;
    });
  } catch (error) {
    return mapDatabaseError(error);
  }
}

export async function archiveOffice(context, officeId, database = getDatabase()) {
  assertResourceId(officeId);
  assertCapability(context, "offices:manage", { organizationId: context?.organizationId });
  return database.transaction(async (transaction) => {
    const office = await findOffice(transaction, context, officeId, { lock: true });
    if (!office.isActive) return office;
    if (!context.officeIds.includes(officeId)) {
      throw serviceError("NOT_FOUND", "The requested resource was not found.");
    }
    const activeRooms = await transaction.select({ total: count() }).from(rooms)
      .where(and(eq(rooms.organizationId, context.organizationId), eq(rooms.officeId, officeId), eq(rooms.isActive, true)));
    if (Number(activeRooms[0]?.total ?? 0) > 0) {
      throw serviceError("CONFLICT", "Archive all active rooms before archiving this office.", {
        dependents: { activeRooms: Number(activeRooms[0].total) },
      });
    }
    const [archived] = await transaction.update(offices)
      .set({ isActive: false })
      .where(and(eq(offices.organizationId, context.organizationId), eq(offices.id, officeId), eq(offices.isActive, true)))
      .returning();
    await recordAuditEvent(transaction, context, {
      operation: "office.archived",
      resourceType: "office",
      resourceId: officeId,
      officeId,
      before: officeSnapshot(office),
      after: officeSnapshot(archived),
    });
    return archived;
  });
}

export async function listRooms(context, officeId, input = {}, database = getDatabase()) {
  const includeArchivedOffice = input.includeArchivedOffice === true && context.role === "organization_admin";
  assertOfficeScope(context, "offices:read", officeId, { allowArchived: includeArchivedOffice });
  const options = parseListOptions(input);
  const officeConditions = [eq(offices.organizationId, context.organizationId), eq(offices.id, officeId)];
  if (!includeArchivedOffice) officeConditions.push(eq(offices.isActive, true));
  const [office] = await database.select().from(offices)
    .where(and(...officeConditions))
    .limit(1);
  if (!office) throw serviceError("NOT_FOUND", "The requested resource was not found.");
  const status = input.status ?? "active";
  if (!new Set(["active", "archived", "all"]).has(status)) {
    throw serviceError("VALIDATION", "Choose active, archived, or all rooms.");
  }
  const conditions = [
    eq(rooms.organizationId, context.organizationId),
    eq(rooms.officeId, officeId),
  ];
  if (status === "active") conditions.push(eq(rooms.isActive, true));
  if (status === "archived") conditions.push(eq(rooms.isActive, false));
  const search = searchCondition(rooms, options.query, ["name", "code"]);
  if (search) conditions.push(search);
  const [rows, totals] = await Promise.all([
    database.select().from(rooms).where(and(...conditions))
      .orderBy(asc(rooms.name), asc(rooms.id)).limit(options.pageSize).offset(options.offset),
    database.select({ total: count() }).from(rooms).where(and(...conditions)),
  ]);
  return paginationResult(rows, totals[0]?.total ?? 0, options);
}

export async function createRoom(context, officeId, input, database = getDatabase()) {
  assertOfficeScope(context, "rooms:manage", officeId);
  const values = normalizeRoomInput(input);
  try {
    return await database.transaction(async (transaction) => {
      const office = await findOffice(transaction, context, officeId, { lock: true });
      if (!office.isActive) throw serviceError("NOT_FOUND", "The requested resource was not found.");
      const [room] = await transaction.insert(rooms).values({
        organizationId: context.organizationId,
        officeId,
        ...values,
      }).returning();
      await recordAuditEvent(transaction, context, {
        operation: "room.created",
        resourceType: "room",
        resourceId: room.id,
        officeId,
        after: roomSnapshot(room),
      });
      return room;
    });
  } catch (error) {
    return mapDatabaseError(error);
  }
}

export async function updateRoom(context, officeId, roomId, input, expectedUpdatedAt, database = getDatabase()) {
  assertResourceId(roomId);
  assertOfficeScope(context, "rooms:manage", officeId);
  const values = normalizeRoomInput(input);
  const expectedTime = new Date(expectedUpdatedAt).getTime();
  if (!Number.isFinite(expectedTime)) {
    throw serviceError("VALIDATION", "Reload the room before saving your changes.");
  }
  try {
    return await database.transaction(async (transaction) => {
      const office = await findOffice(transaction, context, officeId, { lock: true });
      if (!office.isActive) throw serviceError("NOT_FOUND", "The requested resource was not found.");
      const [room] = await transaction.select().from(rooms)
        .where(and(eq(rooms.organizationId, context.organizationId), eq(rooms.officeId, officeId), eq(rooms.id, roomId)))
        .for("update").limit(1);
      if (!room) throw serviceError("NOT_FOUND", "The requested resource was not found.");
      if (!room.isActive) throw serviceError("CONFLICT", "Archived rooms cannot be edited.");
      if (new Date(room.updatedAt).getTime() !== expectedTime) {
        throw serviceError("CONFLICT", "This room changed since you opened it. Reload before saving.");
      }
      const [updated] = await transaction.update(rooms)
        .set({ ...values, updatedAt: new Date(Math.max(Date.now(), room.updatedAt.getTime() + 1)) })
        .where(and(eq(rooms.organizationId, context.organizationId), eq(rooms.officeId, officeId), eq(rooms.id, roomId)))
        .returning();
      await recordAuditEvent(transaction, context, {
        operation: "room.updated",
        resourceType: "room",
        resourceId: room.id,
        officeId,
        before: roomSnapshot(room),
        after: roomSnapshot(updated),
      });
      return updated;
    });
  } catch (error) {
    return mapDatabaseError(error);
  }
}

export async function archiveRoom(context, officeId, roomId, database = getDatabase()) {
  assertResourceId(roomId);
  assertOfficeScope(context, "rooms:manage", officeId);
  return database.transaction(async (transaction) => {
    const office = await findOffice(transaction, context, officeId, { lock: true });
    if (!office.isActive) throw serviceError("NOT_FOUND", "The requested resource was not found.");
    const [room] = await transaction.select().from(rooms)
      .where(and(eq(rooms.organizationId, context.organizationId), eq(rooms.officeId, officeId), eq(rooms.id, roomId)))
      .for("update").limit(1);
    if (!room) throw serviceError("NOT_FOUND", "The requested resource was not found.");
    if (!room.isActive) return room;
    const activeAssignments = await transaction.select({ total: count() }).from(roomAssignments)
      .where(and(
        eq(roomAssignments.organizationId, context.organizationId),
        eq(roomAssignments.officeId, officeId),
        eq(roomAssignments.roomId, roomId),
        sql`${roomAssignments.endedAt} is null`,
      ));
    if (Number(activeAssignments[0]?.total ?? 0) > 0) {
      throw serviceError("CONFLICT", "Move active room assignments before archiving this room.", {
        dependents: { activeRoomAssignments: Number(activeAssignments[0].total) },
      });
    }
    const [archived] = await transaction.update(rooms)
      .set({ isActive: false })
      .where(and(eq(rooms.organizationId, context.organizationId), eq(rooms.officeId, officeId), eq(rooms.id, roomId), eq(rooms.isActive, true)))
      .returning();
    await recordAuditEvent(transaction, context, {
      operation: "room.archived",
      resourceType: "room",
      resourceId: roomId,
      officeId,
      before: roomSnapshot(room),
      after: roomSnapshot(archived),
    });
    return archived;
  });
}
