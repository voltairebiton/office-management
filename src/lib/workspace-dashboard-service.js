import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.js";
import {
  offices,
  organizationMemberships,
  officeAssignments,
  roomAssignments,
  rooms,
  stockLocations,
  stockMovements,
  stockTransactions,
} from "../db/schema.js";
import { hasCapability } from "./authorization.js";
import { listOffices } from "./office-service.js";
import { listRoomNeeds } from "./room-requirement-service.js";
import { buildWorkspaceOverviewData } from "./workspace-overview.js";

const emptyNeeds = {
  roomCountNeedingSupplies: 0,
  roomCountNeedingSuppliesByOffice: {},
  rows: [],
};

function dateLabel(date, timezone) {
  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone || "UTC",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC",
    }).format(date);
  }
}

async function loadAssignedMemberCounts(context, database) {
  const base = (query) => query.from(roomAssignments)
    .innerJoin(rooms, and(
      eq(rooms.organizationId, roomAssignments.organizationId),
      eq(rooms.officeId, roomAssignments.officeId),
      eq(rooms.id, roomAssignments.roomId),
      eq(rooms.isActive, true),
    ))
    .innerJoin(organizationMemberships, and(
      eq(organizationMemberships.organizationId, roomAssignments.organizationId),
      eq(organizationMemberships.id, roomAssignments.membershipId),
      eq(organizationMemberships.status, "active"),
    ))
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
    .where(and(
      eq(roomAssignments.organizationId, context.organizationId),
      inArray(roomAssignments.officeId, context.officeIds),
      isNull(roomAssignments.endedAt),
    ));
  const [byOffice, total] = await Promise.all([
    base(database.select({
      officeId: roomAssignments.officeId,
      count: sql`count(distinct ${roomAssignments.membershipId})::integer`,
    })).groupBy(roomAssignments.officeId),
    base(database.select({
      count: sql`count(distinct ${roomAssignments.membershipId})::integer`,
    })),
  ]);
  return {
    byOffice: byOffice.map((row) => ({ officeId: row.officeId, count: Number(row.count) })),
    total: Number(total[0]?.count ?? 0),
  };
}

async function loadRecentMovements(context, database) {
  if (!context.officeIds.length) return [];
  const transactions = await database.selectDistinct({
    id: stockTransactions.id,
    operation: stockTransactions.operation,
    quantityBefore: stockTransactions.quantityBefore,
    quantityAfter: stockTransactions.quantityAfter,
    createdAt: stockTransactions.createdAt,
  }).from(stockTransactions)
    .innerJoin(stockMovements, and(
      eq(stockMovements.organizationId, stockTransactions.organizationId),
      eq(stockMovements.transactionId, stockTransactions.id),
    ))
    .innerJoin(offices, and(
      eq(offices.organizationId, stockMovements.organizationId),
      eq(offices.id, stockMovements.officeId),
      eq(offices.isActive, true),
    ))
    .where(and(
      eq(stockTransactions.organizationId, context.organizationId),
      inArray(stockMovements.officeId, context.officeIds),
    ))
    .orderBy(desc(stockTransactions.createdAt), desc(stockTransactions.id))
    .limit(12);
  if (!transactions.length) return [];
  const transactionIds = transactions.map((transaction) => transaction.id);
  const legs = await database.select({
    transactionId: stockMovements.transactionId,
    officeId: stockMovements.officeId,
    officeName: offices.name,
    officeTimezone: offices.timezone,
    locationId: stockLocations.id,
    locationName: stockLocations.name,
    itemName: stockMovements.itemName,
    unit: stockMovements.itemUnit,
    movementType: stockMovements.movementType,
    quantityDelta: stockMovements.quantityDelta,
    createdAt: stockMovements.createdAt,
  }).from(stockMovements)
    .innerJoin(offices, and(
      eq(offices.organizationId, stockMovements.organizationId),
      eq(offices.id, stockMovements.officeId),
      eq(offices.isActive, true),
    ))
    .innerJoin(stockLocations, and(
      eq(stockLocations.organizationId, stockMovements.organizationId),
      eq(stockLocations.officeId, stockMovements.officeId),
      eq(stockLocations.id, stockMovements.locationId),
      eq(stockLocations.isActive, true),
    ))
    .where(and(
      eq(stockMovements.organizationId, context.organizationId),
      inArray(stockMovements.transactionId, transactionIds),
      inArray(stockMovements.officeId, context.officeIds),
    ))
    .orderBy(desc(stockMovements.createdAt), asc(stockMovements.id));
  const legsByTransaction = new Map();
  for (const leg of legs) {
    const group = legsByTransaction.get(leg.transactionId) ?? [];
    group.push(leg);
    legsByTransaction.set(leg.transactionId, group);
  }
  return transactions.flatMap((transaction) => {
    const group = legsByTransaction.get(transaction.id) ?? [];
    if (!group.length) return [];
    const source = group.find((leg) => leg.quantityDelta < 0);
    const destination = group.find((leg) => leg.quantityDelta > 0);
    const primary = destination ?? source ?? group[0];
    const kinds = new Set(group.map((leg) => leg.movementType));
    let kind;
    let from;
    let to;
    if (transaction.operation === "receipt") {
      kind = "Receipt";
      from = "Supplier";
      to = destination?.locationName ?? primary.locationName;
    } else if (transaction.operation === "transfer") {
      kind = kinds.has("deployment") ? "Deployment" : kinds.has("return") ? "Return" : "Transfer";
      from = source?.locationName ?? "Another location";
      to = destination?.locationName ?? "Another location";
    } else if (transaction.operation === "consumption") {
      kind = "Consumption";
      from = source?.locationName ?? primary.locationName;
      to = "Used";
    } else if (transaction.operation === "damage") {
      kind = "Damage";
      from = source?.locationName ?? primary.locationName;
      to = "Written off";
    } else {
      kind = "Count correction";
      from = "Counted";
      to = primary.locationName;
    }
    const quantity = transaction.operation === "count_correction"
      ? Math.abs(Number(transaction.quantityAfter) - Number(transaction.quantityBefore))
      : Math.abs(Number(destination?.quantityDelta ?? source?.quantityDelta ?? primary.quantityDelta));
    if (!quantity) return [];
    return [{
      transactionId: transaction.id,
      office: primary.officeId,
      officeName: primary.officeName,
      item: primary.itemName,
      kind,
      quantity,
      unit: primary.unit,
      from,
      to,
      time: dateLabel(transaction.createdAt, primary.officeTimezone),
    }];
  });
}

export async function loadWorkspaceOverview(context, database = getDatabase()) {
  const canReadOffices = hasCapability(context, "offices:read");
  const canReadInventory = hasCapability(context, "inventory:read");
  if (!canReadOffices) {
    return buildWorkspaceOverviewData({
      officeRows: [], officeCount: 0, roomCounts: [], assignedMemberCounts: [], assignedEmployeeCount: 0,
      needsResult: emptyNeeds, movements: [],
    });
  }

  const officeResult = await listOffices(context, { status: "active", page: 1, pageSize: 50 }, database);
  const officeIds = context.officeIds;
  const [roomCounts, assignments, needsResult, movements] = await Promise.all([
    officeIds.length ? database.select({
      officeId: rooms.officeId,
      count: count(),
    }).from(rooms)
      .innerJoin(offices, and(
        eq(offices.organizationId, rooms.organizationId),
        eq(offices.id, rooms.officeId),
        eq(offices.isActive, true),
      ))
      .where(and(
        eq(rooms.organizationId, context.organizationId),
        inArray(rooms.officeId, officeIds),
        eq(rooms.isActive, true),
      ))
      .groupBy(rooms.officeId) : Promise.resolve([]),
    officeIds.length ? loadAssignedMemberCounts(context, database) : Promise.resolve({ byOffice: [], total: 0 }),
    canReadInventory ? listRoomNeeds(context, { status: "shortage", page: 1, pageSize: 50 }, database) : Promise.resolve(emptyNeeds),
    canReadInventory ? loadRecentMovements(context, database) : Promise.resolve([]),
  ]);

  return buildWorkspaceOverviewData({
    officeRows: officeResult.rows,
    officeCount: officeResult.total,
    roomCounts: roomCounts.map((row) => ({ officeId: row.officeId, count: Number(row.count) })),
    assignedMemberCounts: assignments.byOffice,
    assignedEmployeeCount: assignments.total,
    needsResult,
    movements,
  });
}
