import "server-only";
import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { getDatabase } from "../db/index.js";
import {
  inventoryItems,
  offices,
  rooms,
  stockBalances,
  stockLocations,
  stockMovements,
  stockTransactions,
} from "../db/schema.js";
import { recordAuditEvent } from "./audit-repository.js";
import { assertCapability } from "./authorization.js";
import { hashReceiptInput, normalizeReceiptInput } from "./ledger-validation.js";
import { parseListOptions } from "./office-validation.js";

const MAX_INTEGER = 2_147_483_647;

function stockError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

function assertOffice(context, capability, officeId) {
  assertCapability(context, capability, { organizationId: context?.organizationId });
  if (!context?.officeIds?.includes(officeId)) {
    throw stockError("NOT_FOUND", "The requested resource was not found.");
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
    throw stockError("CONFLICT", "This stock request changed while it was being saved. Retry safely.");
  }
  if (findDatabaseCode(error, "23503")) {
    throw stockError("NOT_FOUND", "The requested resource was not found.");
  }
  if (findDatabaseCode(error, "23514")) {
    throw stockError("VALIDATION", "The stock quantity exceeds the supported range.");
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

function searchExpression(query, columns) {
  if (!query) return null;
  const pattern = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  return or(...columns.map((column) => ilike(column, pattern)));
}

async function lockActiveOffice(transaction, context, officeId) {
  const [office] = await transaction.select().from(offices)
    .where(and(eq(offices.organizationId, context.organizationId), eq(offices.id, officeId)))
    .for("update").limit(1);
  if (!office?.isActive) throw stockError("NOT_FOUND", "The requested resource was not found.");
  return office;
}

async function lockReceiptLocation(transaction, context, input) {
  const [location] = await transaction.select().from(stockLocations)
    .where(and(
      eq(stockLocations.organizationId, context.organizationId),
      eq(stockLocations.officeId, input.officeId),
      eq(stockLocations.id, input.locationId),
    )).for("update").limit(1);
  if (!location?.isActive) throw stockError("NOT_FOUND", "The requested resource was not found.");
  if (location.kind !== "storage") {
    throw stockError("VALIDATION", "Receipts can only be added to an office storeroom or pantry.");
  }
  return location;
}

async function lockActiveItem(transaction, context, itemId) {
  const [item] = await transaction.select().from(inventoryItems)
    .where(and(
      eq(inventoryItems.organizationId, context.organizationId),
      eq(inventoryItems.id, itemId),
    )).for("update").limit(1);
  if (!item?.isActive) throw stockError("NOT_FOUND", "The requested resource was not found.");
  return item;
}

async function readReceiptResult(database, transactionRow, replayed = true) {
  const [movement] = await database.select().from(stockMovements)
    .where(and(
      eq(stockMovements.organizationId, transactionRow.organizationId),
      eq(stockMovements.transactionId, transactionRow.id),
    )).orderBy(asc(stockMovements.id)).limit(1);
  if (!movement) throw stockError("DEPENDENCY_UNAVAILABLE", "The receipt record could not be loaded. Retry safely.");
  return {
    transactionId: transactionRow.id,
    movement,
    balanceAfter: movement.balanceAfter,
    replayed,
  };
}

async function findExistingReceipt(database, context, input, payloadHash) {
  const [existing] = await database.select().from(stockTransactions)
    .where(and(
      eq(stockTransactions.organizationId, context.organizationId),
      eq(stockTransactions.operation, "receipt"),
      eq(stockTransactions.requestKey, input.requestKey),
    )).limit(1);
  if (!existing) return null;
  if (existing.payloadHash !== payloadHash) {
    throw stockError("CONFLICT", "This request key was already used for a different receipt.");
  }
  return readReceiptResult(database, existing);
}

export async function receiveStock(
  context,
  input,
  database = getDatabase(),
  { writeAudit = recordAuditEvent, afterMovement = async () => {} } = {},
) {
  assertCapability(context, "inventory:manage", { organizationId: context?.organizationId });
  const values = normalizeReceiptInput(input);
  assertOffice(context, "inventory:manage", values.officeId);
  const payloadHash = hashReceiptInput(values);
  const prior = await findExistingReceipt(database, context, values, payloadHash);
  if (prior) return prior;

  try {
    return await database.transaction(async (transaction) => {
      await lockActiveOffice(transaction, context, values.officeId);
      const location = await lockReceiptLocation(transaction, context, values);
      const item = await lockActiveItem(transaction, context, values.itemId);

      const afterLock = await findExistingReceipt(transaction, context, values, payloadHash);
      if (afterLock) return afterLock;

      const balanceCondition = and(
        eq(stockBalances.organizationId, context.organizationId),
        eq(stockBalances.officeId, values.officeId),
        eq(stockBalances.locationId, values.locationId),
        eq(stockBalances.itemId, values.itemId),
      );
      const [balance] = await transaction.select().from(stockBalances)
        .where(balanceCondition).for("update").limit(1);
      const currentQuantity = balance?.quantity ?? 0;
      const nextQuantity = currentQuantity + values.quantity;
      if (nextQuantity > MAX_INTEGER) {
        throw stockError("VALIDATION", "This receipt would exceed the supported stock quantity.");
      }

      const [stockTransaction] = await transaction.insert(stockTransactions).values({
        organizationId: context.organizationId,
        actorUserId: context.actorUserId,
        actorMembershipId: context.membershipId,
        operation: "receipt",
        requestKey: values.requestKey,
        payloadHash,
        reason: values.reason,
        reference: values.reference,
      }).onConflictDoNothing({
        target: [stockTransactions.organizationId, stockTransactions.operation, stockTransactions.requestKey],
      }).returning();
      if (!stockTransaction) {
        const concurrent = await findExistingReceipt(transaction, context, values, payloadHash);
        if (concurrent) return concurrent;
        throw stockError("CONFLICT", "This stock request changed while it was being saved. Retry safely.");
      }

      const [movement] = await transaction.insert(stockMovements).values({
        organizationId: context.organizationId,
        officeId: values.officeId,
        transactionId: stockTransaction.id,
        actorUserId: context.actorUserId,
        actorMembershipId: context.membershipId,
        locationId: location.id,
        itemId: item.id,
        movementType: "receipt",
        quantityDelta: values.quantity,
        balanceAfter: nextQuantity,
        itemSku: item.sku,
        itemName: item.name,
        itemCategory: item.category,
        itemUnit: item.unit,
        reason: values.reason,
        reference: values.reference,
      }).returning();
      await afterMovement(movement, transaction);

      if (balance) {
        await transaction.update(stockBalances)
          .set({ quantity: nextQuantity, version: balance.version + 1, updatedAt: new Date() })
          .where(eq(stockBalances.id, balance.id));
      } else {
        await transaction.insert(stockBalances).values({
          organizationId: context.organizationId,
          officeId: values.officeId,
          locationId: location.id,
          itemId: item.id,
          quantity: nextQuantity,
          version: 1,
        });
      }

      await writeAudit(transaction, context, {
        operation: "stock.received",
        resourceType: "stock-transaction",
        resourceId: stockTransaction.id,
        requestId: values.requestKey,
        officeId: values.officeId,
        before: { itemSku: item.sku, locationCode: location.code, quantity: currentQuantity },
        after: {
          movementId: movement.id,
          itemSku: item.sku,
          locationCode: location.code,
          quantityDelta: values.quantity,
          balanceAfter: nextQuantity,
          reason: values.reason,
        },
      });

      return { transactionId: stockTransaction.id, movement, balanceAfter: nextQuantity, replayed: false };
    });
  } catch (error) {
    return mapDatabaseError(error);
  }
}

export async function listStockBalances(context, officeId, input = {}, database = getDatabase()) {
  assertOffice(context, "inventory:read", officeId);
  const options = parseListOptions(input);
  const status = input.status ?? "active";
  if (!new Set(["active", "all"]).has(status)) {
    throw stockError("VALIDATION", "Choose active or all stock balances.");
  }
  const conditions = [
    eq(stockBalances.organizationId, context.organizationId),
    eq(stockBalances.officeId, officeId),
    eq(offices.isActive, true),
  ];
  if (status === "active") {
    conditions.push(eq(inventoryItems.isActive, true));
    conditions.push(eq(stockLocations.isActive, true));
    conditions.push(or(eq(stockLocations.kind, "storage"), eq(rooms.isActive, true)));
  }
  const search = searchExpression(options.query, [inventoryItems.sku, inventoryItems.name, stockLocations.code, stockLocations.name, rooms.name]);
  if (search) conditions.push(search);
  const fromQuery = (select) => select.from(stockBalances)
    .innerJoin(offices, and(eq(offices.organizationId, stockBalances.organizationId), eq(offices.id, stockBalances.officeId)))
    .innerJoin(inventoryItems, and(eq(inventoryItems.organizationId, stockBalances.organizationId), eq(inventoryItems.id, stockBalances.itemId)))
    .innerJoin(stockLocations, and(
      eq(stockLocations.organizationId, stockBalances.organizationId),
      eq(stockLocations.officeId, stockBalances.officeId),
      eq(stockLocations.id, stockBalances.locationId),
    ))
    .leftJoin(rooms, and(
      eq(rooms.organizationId, stockLocations.organizationId),
      eq(rooms.officeId, stockLocations.officeId),
      eq(rooms.id, stockLocations.roomId),
    ))
    .where(and(...conditions));
  const [rows, totals] = await Promise.all([
    fromQuery(database.select({
      id: stockBalances.id,
      officeId: stockBalances.officeId,
      locationId: stockBalances.locationId,
      locationCode: stockLocations.code,
      locationName: stockLocations.name,
      roomName: rooms.name,
      locationKind: stockLocations.kind,
      itemId: inventoryItems.id,
      itemSku: inventoryItems.sku,
      itemName: inventoryItems.name,
      itemCategory: inventoryItems.category,
      unit: inventoryItems.unit,
      quantity: stockBalances.quantity,
      version: stockBalances.version,
      updatedAt: stockBalances.updatedAt,
    })).orderBy(asc(inventoryItems.sku), asc(stockLocations.code), asc(stockBalances.id))
      .limit(options.pageSize).offset(options.offset),
    fromQuery(database.select({ total: count() })),
  ]);
  return paginationResult(rows, totals[0]?.total ?? 0, options);
}

export async function listStockMovements(context, officeId, input = {}, database = getDatabase()) {
  assertOffice(context, "inventory:read", officeId);
  const options = parseListOptions(input);
  const conditions = [
    eq(stockMovements.organizationId, context.organizationId),
    eq(stockMovements.officeId, officeId),
    eq(offices.isActive, true),
  ];
  const search = searchExpression(options.query, [stockMovements.itemSku, stockMovements.itemName, stockLocations.code, stockMovements.reason, stockMovements.reference]);
  if (search) conditions.push(search);
  const fromQuery = (select) => select.from(stockMovements)
    .innerJoin(offices, and(eq(offices.organizationId, stockMovements.organizationId), eq(offices.id, stockMovements.officeId)))
    .innerJoin(stockTransactions, and(
      eq(stockTransactions.organizationId, stockMovements.organizationId),
      eq(stockTransactions.id, stockMovements.transactionId),
    ))
    .innerJoin(stockLocations, and(
      eq(stockLocations.organizationId, stockMovements.organizationId),
      eq(stockLocations.officeId, stockMovements.officeId),
      eq(stockLocations.id, stockMovements.locationId),
    ))
    .where(and(...conditions));
  const [rows, totals] = await Promise.all([
    fromQuery(database.select({
      id: stockMovements.id,
      transactionId: stockMovements.transactionId,
      movementType: stockMovements.movementType,
      reversalOfMovementId: stockMovements.reversalOfMovementId,
      quantityDelta: stockMovements.quantityDelta,
      balanceAfter: stockMovements.balanceAfter,
      itemId: stockMovements.itemId,
      itemSku: stockMovements.itemSku,
      itemName: stockMovements.itemName,
      itemCategory: stockMovements.itemCategory,
      itemUnit: stockMovements.itemUnit,
      locationId: stockMovements.locationId,
      locationCode: stockLocations.code,
      reason: stockMovements.reason,
      reference: stockMovements.reference,
      requestKey: stockTransactions.requestKey,
      actorUserId: stockMovements.actorUserId,
      actorMembershipId: stockMovements.actorMembershipId,
      createdAt: stockMovements.createdAt,
    })).orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(options.pageSize).offset(options.offset),
    fromQuery(database.select({ total: count() })),
  ]);
  return paginationResult(rows, totals[0]?.total ?? 0, options);
}
