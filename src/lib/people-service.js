import "server-only";
import { and, asc, count, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { officeAssignments, offices, organizationMemberships, roomAssignments, rooms, users } from "../db/schema.js";
import { getDatabase } from "../db/index.js";
import { recordAuditEvent } from "./audit-repository.js";
import { assertCapability } from "./authorization.js";
import { parseListOptions } from "./office-validation.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function peopleError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

function assertId(value) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw peopleError("NOT_FOUND", "The requested resource was not found.");
  }
}

function assertOffice(context, capability, officeId) {
  assertId(officeId);
  assertCapability(context, capability, { organizationId: context?.organizationId });
  if (!context?.officeIds?.includes(officeId)) {
    throw peopleError("NOT_FOUND", "The requested resource was not found.");
  }
}

function dbCode(error, code) {
  for (let current = error; current; current = current.cause) {
    if (current.code === code) return true;
  }
  return false;
}

function stableDatabaseError(error) {
  if (dbCode(error, "23505")) {
    throw peopleError("CONFLICT", "That assignment changed while you were saving. Reload and try again.");
  }
  throw error;
}

function snapshotAccess(access, isActive = access.isActive) {
  return { membershipId: access.membershipId, officeId: access.officeId, isActive };
}

function snapshotRoomAssignment(assignment, endedAt = assignment.endedAt) {
  return {
    membershipId: assignment.membershipId,
    officeId: assignment.officeId,
    roomId: assignment.roomId,
    startedAt: assignment.startedAt.toISOString(),
    endedAt: endedAt?.toISOString() ?? null,
  };
}

function searchExpression(query, columns) {
  if (!query) return null;
  const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  return or(...columns.map((column) => ilike(column, pattern)));
}

function buildPage(rows, total, options) {
  return {
    rows,
    total: Number(total),
    page: options.page,
    pageSize: options.pageSize,
    totalPages: Math.ceil(Number(total) / options.pageSize),
  };
}

function validatedStatus(value, allowed, fallback, label) {
  const status = value ?? fallback;
  if (!allowed.includes(status)) {
    throw peopleError("VALIDATION", `Choose a valid ${label} status.`);
  }
  return status;
}

async function lockActiveOffice(transaction, context, officeId) {
  const [office] = await transaction.select().from(offices)
    .where(and(eq(offices.organizationId, context.organizationId), eq(offices.id, officeId)))
    .for("update").limit(1);
  if (!office?.isActive) throw peopleError("NOT_FOUND", "The requested resource was not found.");
  return office;
}

async function lockMembership(transaction, context, membershipId, { requireActive = true } = {}) {
  const [membership] = await transaction.select().from(organizationMemberships)
    .where(and(
      eq(organizationMemberships.organizationId, context.organizationId),
      eq(organizationMemberships.id, membershipId),
    ))
    .for("update").limit(1);
  if (!membership || (requireActive && membership.status !== "active")) {
    throw peopleError("NOT_FOUND", "The requested resource was not found.");
  }
  return membership;
}

async function lockOfficeAccess(transaction, context, officeId, membershipId) {
  const [access] = await transaction.select().from(officeAssignments)
    .where(and(
      eq(officeAssignments.organizationId, context.organizationId),
      eq(officeAssignments.officeId, officeId),
      eq(officeAssignments.membershipId, membershipId),
    ))
    .for("update").limit(1);
  return access ?? null;
}

export async function listMembers(context, input = {}, database = getDatabase()) {
  assertCapability(context, "members:read", { organizationId: context?.organizationId });
  const options = parseListOptions(input);
  const status = validatedStatus(input.status, ["active", "inactive", "pending", "all"], "active", "member");
  const conditions = [eq(organizationMemberships.organizationId, context.organizationId)];
  if (status !== "all") conditions.push(eq(organizationMemberships.status, status));
  const search = searchExpression(options.query, [users.displayName, users.email]);
  if (search) conditions.push(search);
  const [rows, totals] = await Promise.all([
    database.select({
      id: organizationMemberships.id,
      userId: users.id,
      displayName: users.displayName,
      email: users.email,
      role: organizationMemberships.role,
      status: organizationMemberships.status,
      createdAt: organizationMemberships.createdAt,
    }).from(organizationMemberships)
      .innerJoin(users, eq(users.id, organizationMemberships.userId))
      .where(and(...conditions))
      .orderBy(asc(users.displayName), asc(users.email), asc(organizationMemberships.id))
      .limit(options.pageSize).offset(options.offset),
    database.select({ total: count() }).from(organizationMemberships)
      .innerJoin(users, eq(users.id, organizationMemberships.userId))
      .where(and(...conditions)),
  ]);
  return buildPage(rows, totals[0]?.total ?? 0, options);
}

export async function listAssignableMembers(context, officeId, input = {}, database = getDatabase()) {
  assertOffice(context, "assignments:manage", officeId);
  const options = parseListOptions(input);
  const [office] = await database.select({ id: offices.id }).from(offices)
    .where(and(eq(offices.organizationId, context.organizationId), eq(offices.id, officeId), eq(offices.isActive, true)))
    .limit(1);
  if (!office) throw peopleError("NOT_FOUND", "The requested resource was not found.");
  const conditions = [
    eq(officeAssignments.organizationId, context.organizationId),
    eq(officeAssignments.officeId, officeId),
    eq(officeAssignments.isActive, true),
    eq(organizationMemberships.status, "active"),
  ];
  const search = searchExpression(options.query, [users.displayName, users.email]);
  if (search) conditions.push(search);
  const [rows, totals] = await Promise.all([
    database.select({
      id: organizationMemberships.id,
      userId: users.id,
      displayName: users.displayName,
      email: users.email,
      role: organizationMemberships.role,
      officeId: officeAssignments.officeId,
    }).from(officeAssignments)
      .innerJoin(organizationMemberships, and(
        eq(organizationMemberships.organizationId, officeAssignments.organizationId),
        eq(organizationMemberships.id, officeAssignments.membershipId),
      ))
      .innerJoin(users, eq(users.id, organizationMemberships.userId))
      .where(and(...conditions))
      .orderBy(asc(users.displayName), asc(users.email), asc(organizationMemberships.id))
      .limit(options.pageSize).offset(options.offset),
    database.select({ total: count() }).from(officeAssignments)
      .innerJoin(organizationMemberships, and(
        eq(organizationMemberships.organizationId, officeAssignments.organizationId),
        eq(organizationMemberships.id, officeAssignments.membershipId),
      ))
      .innerJoin(users, eq(users.id, organizationMemberships.userId))
      .where(and(...conditions)),
  ]);
  return buildPage(rows, totals[0]?.total ?? 0, options);
}

export async function listOfficeAccess(context, input = {}, database = getDatabase()) {
  assertCapability(context, "members:read", { organizationId: context?.organizationId });
  const options = parseListOptions(input);
  const status = validatedStatus(input.status, ["active", "inactive", "all"], "active", "office access");
  const conditions = [eq(officeAssignments.organizationId, context.organizationId)];
  if (status !== "all") conditions.push(eq(officeAssignments.isActive, status === "active"));
  const search = searchExpression(options.query, [users.displayName, users.email, offices.name, offices.code]);
  if (search) conditions.push(search);
  const baseQuery = (select) => select.from(officeAssignments)
    .innerJoin(organizationMemberships, and(
      eq(organizationMemberships.organizationId, officeAssignments.organizationId),
      eq(organizationMemberships.id, officeAssignments.membershipId),
    ))
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .innerJoin(offices, and(
      eq(offices.organizationId, officeAssignments.organizationId),
      eq(offices.id, officeAssignments.officeId),
    ))
    .where(and(...conditions));
  const [rows, totals] = await Promise.all([
    baseQuery(database.select({
      id: officeAssignments.id,
      membershipId: organizationMemberships.id,
      officeId: offices.id,
      officeName: offices.name,
      officeCode: offices.code,
      isActive: officeAssignments.isActive,
      memberStatus: organizationMemberships.status,
      displayName: users.displayName,
      email: users.email,
      role: organizationMemberships.role,
    })).orderBy(asc(offices.name), asc(users.displayName), asc(users.email), asc(officeAssignments.id))
      .limit(options.pageSize).offset(options.offset),
    baseQuery(database.select({ total: count() })),
  ]);
  return buildPage(rows, totals[0]?.total ?? 0, options);
}

export async function listMemberOfficeAccess(context, membershipIds, database = getDatabase()) {
  assertCapability(context, "members:read", { organizationId: context?.organizationId });
  if (!Array.isArray(membershipIds) || membershipIds.length > 50) {
    throw peopleError("VALIDATION", "Choose a valid page of members.");
  }
  const ids = [...new Set(membershipIds)];
  for (const membershipId of ids) assertId(membershipId);
  if (!ids.length) return [];
  return database.select({
    membershipId: officeAssignments.membershipId,
    officeId: offices.id,
    officeName: offices.name,
  }).from(officeAssignments)
    .innerJoin(organizationMemberships, and(
      eq(organizationMemberships.organizationId, officeAssignments.organizationId),
      eq(organizationMemberships.id, officeAssignments.membershipId),
      eq(organizationMemberships.status, "active"),
    ))
    .innerJoin(offices, and(
      eq(offices.organizationId, officeAssignments.organizationId),
      eq(offices.id, officeAssignments.officeId),
      eq(offices.isActive, true),
    ))
    .where(and(
      eq(officeAssignments.organizationId, context.organizationId),
      eq(officeAssignments.isActive, true),
      inArray(officeAssignments.membershipId, ids),
    ))
    .orderBy(asc(offices.name), asc(officeAssignments.membershipId));
}

export async function listOfficeRoster(context, officeId, input = {}, database = getDatabase()) {
  assertOffice(context, "assignments:manage", officeId);
  const options = parseListOptions(input);
  const [office] = await database.select({ id: offices.id }).from(offices)
    .where(and(eq(offices.organizationId, context.organizationId), eq(offices.id, officeId), eq(offices.isActive, true)))
    .limit(1);
  if (!office) throw peopleError("NOT_FOUND", "The requested resource was not found.");
  const conditions = [
    eq(officeAssignments.organizationId, context.organizationId),
    eq(officeAssignments.officeId, officeId),
    eq(officeAssignments.isActive, true),
    eq(organizationMemberships.status, "active"),
  ];
  const search = searchExpression(options.query, [users.displayName, users.email]);
  if (search) conditions.push(search);
  const baseQuery = (select) => select.from(officeAssignments)
    .innerJoin(organizationMemberships, and(
      eq(organizationMemberships.organizationId, officeAssignments.organizationId),
      eq(organizationMemberships.id, officeAssignments.membershipId),
    ))
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .leftJoin(roomAssignments, and(
      eq(roomAssignments.organizationId, officeAssignments.organizationId),
      eq(roomAssignments.officeId, officeAssignments.officeId),
      eq(roomAssignments.membershipId, officeAssignments.membershipId),
      isNull(roomAssignments.endedAt),
    ))
    .leftJoin(rooms, and(
      eq(rooms.organizationId, roomAssignments.organizationId),
      eq(rooms.officeId, roomAssignments.officeId),
      eq(rooms.id, roomAssignments.roomId),
      eq(rooms.isActive, true),
    ))
    .where(and(...conditions));
  const [rows, totals] = await Promise.all([
    baseQuery(database.select({
      membershipId: organizationMemberships.id,
      displayName: users.displayName,
      email: users.email,
      role: organizationMemberships.role,
      assignmentId: roomAssignments.id,
      roomId: rooms.id,
      roomName: rooms.name,
      roomCode: rooms.code,
      capacity: rooms.capacity,
    })).orderBy(asc(users.displayName), asc(users.email), asc(organizationMemberships.id))
      .limit(options.pageSize).offset(options.offset),
    baseQuery(database.select({ total: count() })),
  ]);
  return buildPage(rows, totals[0]?.total ?? 0, options);
}

export async function grantOfficeAccess(context, membershipId, officeId, database = getDatabase()) {
  assertId(membershipId);
  assertOffice(context, "office-access:manage", officeId);
  return database.transaction(async (transaction) => {
    await lockActiveOffice(transaction, context, officeId);
    await lockMembership(transaction, context, membershipId);
    const existing = await lockOfficeAccess(transaction, context, officeId, membershipId);
    if (existing?.isActive) return existing;

    const [access] = existing
      ? await transaction.update(officeAssignments)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(officeAssignments.id, existing.id)).returning()
      : await transaction.insert(officeAssignments).values({
        organizationId: context.organizationId,
        officeId,
        membershipId,
        isActive: true,
      }).returning();
    await recordAuditEvent(transaction, context, {
      operation: "office_access.granted",
      resourceType: "office-access",
      resourceId: access.id,
      officeId,
      before: existing ? snapshotAccess(existing) : null,
      after: snapshotAccess(access),
    });
    return access;
  });
}

export async function revokeOfficeAccess(context, membershipId, officeId, database = getDatabase()) {
  assertId(membershipId);
  assertOffice(context, "office-access:manage", officeId);
  return database.transaction(async (transaction) => {
    await lockActiveOffice(transaction, context, officeId);
    await lockMembership(transaction, context, membershipId, { requireActive: false });
    const access = await lockOfficeAccess(transaction, context, officeId, membershipId);
    if (!access?.isActive) return access ?? null;
    const at = new Date();
    const [revoked] = await transaction.update(officeAssignments)
      .set({ isActive: false, updatedAt: at })
      .where(eq(officeAssignments.id, access.id)).returning();
    const ended = await transaction.update(roomAssignments)
      .set({ endedAt: at, updatedAt: at })
      .where(and(
        eq(roomAssignments.organizationId, context.organizationId),
        eq(roomAssignments.officeId, officeId),
        eq(roomAssignments.membershipId, membershipId),
        isNull(roomAssignments.endedAt),
      )).returning();
    await recordAuditEvent(transaction, context, {
      operation: "office_access.revoked",
      resourceType: "office-access",
      resourceId: access.id,
      officeId,
      before: snapshotAccess(access),
      after: { ...snapshotAccess(revoked), endedRoomAssignments: ended.length },
    });
    return revoked;
  });
}

function expectedAssignmentId(value) {
  if (value === undefined || value === null || value === "") return null;
  assertId(value);
  return value;
}

async function activeRoomAssignment(transaction, context, officeId, membershipId) {
  const [assignment] = await transaction.select().from(roomAssignments)
    .where(and(
      eq(roomAssignments.organizationId, context.organizationId),
      eq(roomAssignments.officeId, officeId),
      eq(roomAssignments.membershipId, membershipId),
      isNull(roomAssignments.endedAt),
    ))
    .for("update").limit(1);
  return assignment ?? null;
}

export async function assignMemberToRoom(
  context,
  officeId,
  membershipId,
  roomId,
  options = {},
  database = getDatabase(),
  { writeAudit = recordAuditEvent } = {},
) {
  assertOffice(context, "assignments:manage", officeId);
  assertId(membershipId);
  assertId(roomId);
  const expectedId = expectedAssignmentId(options.expectedAssignmentId);
  try {
    return await database.transaction(async (transaction) => {
      await lockActiveOffice(transaction, context, officeId);
      const [room] = await transaction.select().from(rooms)
        .where(and(
          eq(rooms.organizationId, context.organizationId),
          eq(rooms.officeId, officeId),
          eq(rooms.id, roomId),
          eq(rooms.isActive, true),
        ))
        .for("update").limit(1);
      if (!room) throw peopleError("NOT_FOUND", "The requested resource was not found.");
      await lockMembership(transaction, context, membershipId);
      const access = await lockOfficeAccess(transaction, context, officeId, membershipId);
      if (!access?.isActive) throw peopleError("NOT_FOUND", "The requested resource was not found.");
      const existing = await activeRoomAssignment(transaction, context, officeId, membershipId);
      if ((existing?.id ?? null) !== expectedId) {
        throw peopleError("CONFLICT", "This room assignment changed. Reload before assigning the member again.");
      }
      if (existing?.roomId === roomId) return existing;

      const at = new Date();
      if (existing) {
        await transaction.update(roomAssignments)
          .set({ endedAt: at, updatedAt: at })
          .where(eq(roomAssignments.id, existing.id));
      }
      const [assignment] = await transaction.insert(roomAssignments).values({
        organizationId: context.organizationId,
        officeId,
        membershipId,
        roomId,
        startedAt: at,
        updatedAt: at,
      }).returning();
      await writeAudit(transaction, context, {
        operation: existing ? "room_assignment.reassigned" : "room_assignment.created",
        resourceType: "room-assignment",
        resourceId: assignment.id,
        officeId,
        before: existing ? snapshotRoomAssignment(existing, at) : null,
        after: snapshotRoomAssignment(assignment),
      });
      return assignment;
    });
  } catch (error) {
    return stableDatabaseError(error);
  }
}

export async function endRoomAssignment(context, officeId, membershipId, options = {}, database = getDatabase()) {
  assertOffice(context, "assignments:manage", officeId);
  assertId(membershipId);
  const expectedId = expectedAssignmentId(options.expectedAssignmentId);
  return database.transaction(async (transaction) => {
    await lockActiveOffice(transaction, context, officeId);
    await lockMembership(transaction, context, membershipId);
    const access = await lockOfficeAccess(transaction, context, officeId, membershipId);
    if (!access?.isActive) throw peopleError("NOT_FOUND", "The requested resource was not found.");
    const existing = await activeRoomAssignment(transaction, context, officeId, membershipId);
    if (!existing) return null;
    if (existing.id !== expectedId) {
      throw peopleError("CONFLICT", "This room assignment changed. Reload before ending it.");
    }
    const at = new Date();
    const [ended] = await transaction.update(roomAssignments)
      .set({ endedAt: at, updatedAt: at })
      .where(eq(roomAssignments.id, existing.id)).returning();
    await recordAuditEvent(transaction, context, {
      operation: "room_assignment.ended",
      resourceType: "room-assignment",
      resourceId: existing.id,
      officeId,
      before: snapshotRoomAssignment(existing),
      after: snapshotRoomAssignment(ended),
    });
    return ended;
  });
}

export async function listOwnAssignments(context, database = getDatabase()) {
  assertCapability(context, "assignments:read:self", { organizationId: context?.organizationId });
  if (!context.membershipId) return [];
  const [membership] = await database.select({ id: organizationMemberships.id })
    .from(organizationMemberships)
    .where(and(
      eq(organizationMemberships.organizationId, context.organizationId),
      eq(organizationMemberships.id, context.membershipId),
      eq(organizationMemberships.userId, context.actorUserId),
      eq(organizationMemberships.status, "active"),
    )).limit(1);
  if (!membership) return [];
  return database.select({
    id: roomAssignments.id,
    officeId: offices.id,
    officeName: offices.name,
    roomId: rooms.id,
    roomName: rooms.name,
    roomCode: rooms.code,
    capacity: rooms.capacity,
    startedAt: roomAssignments.startedAt,
  }).from(roomAssignments)
    .innerJoin(officeAssignments, and(
      eq(officeAssignments.organizationId, roomAssignments.organizationId),
      eq(officeAssignments.officeId, roomAssignments.officeId),
      eq(officeAssignments.membershipId, roomAssignments.membershipId),
      eq(officeAssignments.isActive, true),
    ))
    .innerJoin(offices, and(
      eq(offices.organizationId, roomAssignments.organizationId),
      eq(offices.id, roomAssignments.officeId),
      eq(offices.isActive, true),
    ))
    .innerJoin(rooms, and(
      eq(rooms.organizationId, roomAssignments.organizationId),
      eq(rooms.officeId, roomAssignments.officeId),
      eq(rooms.id, roomAssignments.roomId),
      eq(rooms.isActive, true),
    ))
    .where(and(
      eq(roomAssignments.organizationId, context.organizationId),
      eq(roomAssignments.membershipId, context.membershipId),
      isNull(roomAssignments.endedAt),
    ))
    .orderBy(asc(offices.name), asc(rooms.name), asc(roomAssignments.startedAt));
}

async function activeAssignmentRows(context, database, officeIds) {
  if (!officeIds.length) return [];
  return database.select({
    officeId: roomAssignments.officeId,
    membershipId: roomAssignments.membershipId,
  }).from(roomAssignments)
    .innerJoin(officeAssignments, and(
      eq(officeAssignments.organizationId, roomAssignments.organizationId),
      eq(officeAssignments.officeId, roomAssignments.officeId),
      eq(officeAssignments.membershipId, roomAssignments.membershipId),
      eq(officeAssignments.isActive, true),
    ))
    .innerJoin(organizationMemberships, and(
      eq(organizationMemberships.organizationId, roomAssignments.organizationId),
      eq(organizationMemberships.id, roomAssignments.membershipId),
      eq(organizationMemberships.status, "active"),
    ))
    .innerJoin(offices, and(
      eq(offices.organizationId, roomAssignments.organizationId),
      eq(offices.id, roomAssignments.officeId),
      eq(offices.isActive, true),
    ))
    .innerJoin(rooms, and(
      eq(rooms.organizationId, roomAssignments.organizationId),
      eq(rooms.officeId, roomAssignments.officeId),
      eq(rooms.id, roomAssignments.roomId),
      eq(rooms.isActive, true),
    ))
    .where(and(
      eq(roomAssignments.organizationId, context.organizationId),
      inArray(roomAssignments.officeId, officeIds),
      isNull(roomAssignments.endedAt),
    ));
}

export async function getAssignmentCounts(context, database = getDatabase()) {
  assertCapability(context, "offices:read", { organizationId: context?.organizationId });
  const officeIds = context.officeIds ?? [];
  const rows = await activeAssignmentRows(context, database, officeIds);
  const membersByOffice = new Map();
  const distinctMembers = new Set();
  for (const row of rows) {
    if (!membersByOffice.has(row.officeId)) membersByOffice.set(row.officeId, new Set());
    membersByOffice.get(row.officeId).add(row.membershipId);
    distinctMembers.add(row.membershipId);
  }
  return {
    offices: [...officeIds].sort().map((officeId) => ({
      officeId,
      assignedCount: membersByOffice.get(officeId)?.size ?? 0,
    })),
    distinctActiveMembers: distinctMembers.size,
  };
}

export async function getRoomAssignmentCounts(context, officeId, database = getDatabase()) {
  assertOffice(context, "offices:read", officeId);
  const [office] = await database.select({ id: offices.id }).from(offices)
    .where(and(eq(offices.organizationId, context.organizationId), eq(offices.id, officeId), eq(offices.isActive, true)))
    .limit(1);
  if (!office) throw peopleError("NOT_FOUND", "The requested resource was not found.");
  const roomRows = await database.select({ id: rooms.id, capacity: rooms.capacity })
    .from(rooms)
    .where(and(eq(rooms.organizationId, context.organizationId), eq(rooms.officeId, officeId), eq(rooms.isActive, true)))
    .orderBy(asc(rooms.name), asc(rooms.id));
  const assignmentRows = await database.select({
    roomId: roomAssignments.roomId,
    membershipId: roomAssignments.membershipId,
  }).from(roomAssignments)
    .innerJoin(officeAssignments, and(
      eq(officeAssignments.organizationId, roomAssignments.organizationId),
      eq(officeAssignments.officeId, roomAssignments.officeId),
      eq(officeAssignments.membershipId, roomAssignments.membershipId),
      eq(officeAssignments.isActive, true),
    ))
    .innerJoin(organizationMemberships, and(
      eq(organizationMemberships.organizationId, roomAssignments.organizationId),
      eq(organizationMemberships.id, roomAssignments.membershipId),
      eq(organizationMemberships.status, "active"),
    ))
    .where(and(
      eq(roomAssignments.organizationId, context.organizationId),
      eq(roomAssignments.officeId, officeId),
      isNull(roomAssignments.endedAt),
    ));
  const membersByRoom = new Map();
  for (const row of assignmentRows) {
    if (!membersByRoom.has(row.roomId)) membersByRoom.set(row.roomId, new Set());
    membersByRoom.get(row.roomId).add(row.membershipId);
  }
  return roomRows.map((room) => {
    const assignedCount = membersByRoom.get(room.id)?.size ?? 0;
    return {
      roomId: room.id,
      capacity: room.capacity,
      assignedCount,
      overCapacity: room.capacity !== null && assignedCount > room.capacity,
    };
  });
}

export async function endAssignmentsForDeactivatedMembership(transaction, membership) {
  const at = new Date();
  await transaction.update(officeAssignments)
    .set({ isActive: false, updatedAt: at })
    .where(and(
      eq(officeAssignments.organizationId, membership.organizationId),
      eq(officeAssignments.membershipId, membership.id),
      eq(officeAssignments.isActive, true),
    ));
  await transaction.update(roomAssignments)
    .set({ endedAt: at, updatedAt: at })
    .where(and(
      eq(roomAssignments.organizationId, membership.organizationId),
      eq(roomAssignments.membershipId, membership.id),
      isNull(roomAssignments.endedAt),
    ));
}
