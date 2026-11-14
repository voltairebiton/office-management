import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
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
import { hashTransferInput, normalizeTransferInput } from "./transfer-validation.js";

const MAX_INTEGER = 2_147_483_647;

function transferError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertOffice(context, officeId) {
  assertCapability(context, "inventory:manage", { organizationId: context?.organizationId });
  if (!context?.officeIds?.includes(officeId)) {
    throw transferError("NOT_FOUND", "The requested resource was not found.");
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
    throw transferError("CONFLICT", "This stock request changed while it was being saved. Retry safely.");
  }
  if (findDatabaseCode(error, "23503")) {
    throw transferError("NOT_FOUND", "The requested resource was not found.");
  }
  if (findDatabaseCode(error, "23514")) {
    throw transferError("VALIDATION", "The resulting stock quantity is outside the supported range.");
  }
  throw error;
}

async function lockActiveOffice(transaction, context, officeId) {
  const [office] = await transaction.select().from(offices)
    .where(and(eq(offices.organizationId, context.organizationId), eq(offices.id, officeId)))
    .for("update").limit(1);
  if (!office?.isActive) throw transferError("NOT_FOUND", "The requested resource was not found.");
}

async function lockLocationsInOrder(transaction, context, input) {
  const ids = [input.sourceLocationId, input.destinationLocationId].sort();
  const rows = await transaction.select().from(stockLocations)
    .where(and(
      eq(stockLocations.organizationId, context.organizationId),
      eq(stockLocations.officeId, input.officeId),
      inArray(stockLocations.id, ids),
    ))
    .orderBy(asc(stockLocations.id))
    .for("update");
  const byId = new Map(rows.map((location) => [location.id, location]));
  const source = byId.get(input.sourceLocationId);
  const destination = byId.get(input.destinationLocationId);
  if (!source?.isActive || !destination?.isActive || rows.length !== 2) {
    throw transferError("NOT_FOUND", "The requested resource was not found.");
  }
  if (input.intent === "deployment" && (source.kind !== "storage" || destination.kind !== "room")) {
    throw transferError("VALIDATION", "Deploy stock from an office storeroom or pantry into a room.");
  }
  if (input.intent === "return" && (source.kind !== "room" || destination.kind !== "storage")) {
    throw transferError("VALIDATION", "Return stock from a room to an office storeroom or pantry.");
  }
  return { source, destination };
}

async function lockActiveItem(transaction, context, itemId) {
  const [item] = await transaction.select().from(inventoryItems)
    .where(and(
      eq(inventoryItems.organizationId, context.organizationId),
      eq(inventoryItems.id, itemId),
    )).for("update").limit(1);
  if (!item?.isActive) throw transferError("NOT_FOUND", "The requested resource was not found.");
  return item;
}

async function readTransferResult(database, transactionRow, replayed = true) {
  const movements = await database.select().from(stockMovements)
    .where(and(
      eq(stockMovements.organizationId, transactionRow.organizationId),
      eq(stockMovements.transactionId, transactionRow.id),
    )).orderBy(asc(stockMovements.createdAt), asc(stockMovements.id));
  if (movements.length !== 2) {
    throw transferError("DEPENDENCY_UNAVAILABLE", "The transfer record could not be loaded. Retry safely.");
  }
  const outgoing = movements.find((movement) => movement.quantityDelta < 0);
  const incoming = movements.find((movement) => movement.quantityDelta > 0);
  if (!outgoing || !incoming) {
    throw transferError("DEPENDENCY_UNAVAILABLE", "The transfer record could not be loaded. Retry safely.");
  }
  return {
    transactionId: transactionRow.id,
    movements,
    outgoing,
    incoming,
    sourceBalanceAfter: outgoing.balanceAfter,
    destinationBalanceAfter: incoming.balanceAfter,
    replayed,
  };
}

async function findExistingTransfer(database, context, input, payloadHash) {
  const [existing] = await database.select().from(stockTransactions)
    .where(and(
      eq(stockTransactions.organizationId, context.organizationId),
      eq(stockTransactions.operation, "transfer"),
      eq(stockTransactions.requestKey, input.requestKey),
    )).limit(1);
  if (!existing) return null;
  if (existing.payloadHash !== payloadHash) {
    throw transferError("CONFLICT", "This request key was already used for a different stock transfer.");
  }
  return readTransferResult(database, existing);
}

export async function transferStock(
  context,
  input,
  database = getDatabase(),
  { writeAudit = recordAuditEvent, afterDebit = async () => {} } = {},
) {
  assertCapability(context, "inventory:manage", { organizationId: context?.organizationId });
  const values = normalizeTransferInput(input);
  assertOffice(context, values.officeId);
  const payloadHash = hashTransferInput(values);
  const previous = await findExistingTransfer(database, context, values, payloadHash);
  if (previous) return previous;

  try {
    return await database.transaction(async (transaction) => {
      // The office row serializes all stock writes in that office. Location and balance locks
      // are still acquired by ID so opposite-direction transfers always share one lock order.
      await lockActiveOffice(transaction, context, values.officeId);
      const { source, destination } = await lockLocationsInOrder(transaction, context, values);
      const item = await lockActiveItem(transaction, context, values.itemId);
      const afterLock = await findExistingTransfer(transaction, context, values, payloadHash);
      if (afterLock) return afterLock;

      const locations = [source.id, destination.id].sort();
      const balances = await transaction.select().from(stockBalances)
        .where(and(
          eq(stockBalances.organizationId, context.organizationId),
          eq(stockBalances.officeId, values.officeId),
          inArray(stockBalances.locationId, locations),
          eq(stockBalances.itemId, item.id),
        ))
        .orderBy(asc(stockBalances.locationId), asc(stockBalances.id))
        .for("update");
      const balancesByLocation = new Map(balances.map((balance) => [balance.locationId, balance]));
      const sourceBalance = balancesByLocation.get(source.id);
      const destinationBalance = balancesByLocation.get(destination.id);
      const sourceQuantity = sourceBalance?.quantity ?? 0;
      const destinationQuantity = destinationBalance?.quantity ?? 0;
      if (sourceQuantity < values.quantity) {
        throw transferError("CONFLICT", "There is not enough stock at the source location for this transfer.");
      }
      const sourceAfter = sourceQuantity - values.quantity;
      const destinationAfter = destinationQuantity + values.quantity;
      if (destinationAfter > MAX_INTEGER) {
        throw transferError("VALIDATION", "The destination balance would exceed the supported stock quantity.");
      }

      const [stockTransaction] = await transaction.insert(stockTransactions).values({
        organizationId: context.organizationId,
        actorUserId: context.actorUserId,
        actorMembershipId: context.membershipId,
        operation: "transfer",
        requestKey: values.requestKey,
        payloadHash,
        reason: values.intent,
        reference: values.reference,
      }).onConflictDoNothing({
        target: [stockTransactions.organizationId, stockTransactions.operation, stockTransactions.requestKey],
      }).returning();
      if (!stockTransaction) {
        const concurrent = await findExistingTransfer(transaction, context, values, payloadHash);
        if (concurrent) return concurrent;
        throw transferError("CONFLICT", "This stock request changed while it was being saved. Retry safely.");
      }

      const outgoingType = values.intent === "transfer" ? "transfer_out" : values.intent;
      const incomingType = values.intent === "transfer" ? "transfer_in" : values.intent;
      const [outgoing] = await transaction.insert(stockMovements).values({
        organizationId: context.organizationId,
        officeId: values.officeId,
        transactionId: stockTransaction.id,
        actorUserId: context.actorUserId,
        actorMembershipId: context.membershipId,
        locationId: source.id,
        itemId: item.id,
        movementType: outgoingType,
        quantityDelta: -values.quantity,
        balanceAfter: sourceAfter,
        itemSku: item.sku,
        itemName: item.name,
        itemCategory: item.category,
        itemUnit: item.unit,
        reason: values.intent,
        reference: values.reference,
      }).returning();

      if (sourceBalance) {
        await transaction.update(stockBalances).set({
          quantity: sourceAfter,
          version: sourceBalance.version + 1,
          updatedAt: new Date(),
        }).where(eq(stockBalances.id, sourceBalance.id));
      }
      await afterDebit(outgoing, transaction);

      const [incoming] = await transaction.insert(stockMovements).values({
        organizationId: context.organizationId,
        officeId: values.officeId,
        transactionId: stockTransaction.id,
        actorUserId: context.actorUserId,
        actorMembershipId: context.membershipId,
        locationId: destination.id,
        itemId: item.id,
        movementType: incomingType,
        quantityDelta: values.quantity,
        balanceAfter: destinationAfter,
        itemSku: item.sku,
        itemName: item.name,
        itemCategory: item.category,
        itemUnit: item.unit,
        reason: values.intent,
        reference: values.reference,
      }).returning();

      if (destinationBalance) {
        await transaction.update(stockBalances).set({
          quantity: destinationAfter,
          version: destinationBalance.version + 1,
          updatedAt: new Date(),
        }).where(eq(stockBalances.id, destinationBalance.id));
      } else {
        await transaction.insert(stockBalances).values({
          organizationId: context.organizationId,
          officeId: values.officeId,
          locationId: destination.id,
          itemId: item.id,
          quantity: destinationAfter,
          version: 1,
        });
      }

      await writeAudit(transaction, context, {
        operation: values.intent === "deployment" ? "stock.deployed" : values.intent === "return" ? "stock.returned" : "stock.transferred",
        resourceType: "stock-transaction",
        resourceId: stockTransaction.id,
        requestId: values.requestKey,
        officeId: values.officeId,
        before: {
          itemSku: item.sku,
          sourceLocationCode: source.code,
          destinationLocationCode: destination.code,
          sourceQuantity,
          destinationQuantity,
        },
        after: {
          outgoingMovementId: outgoing.id,
          incomingMovementId: incoming.id,
          itemSku: item.sku,
          quantity: values.quantity,
          intent: values.intent,
          sourceBalanceAfter: sourceAfter,
          destinationBalanceAfter: destinationAfter,
          reference: values.reference,
        },
      });

      return {
        transactionId: stockTransaction.id,
        movements: [outgoing, incoming],
        outgoing,
        incoming,
        sourceBalanceAfter: sourceAfter,
        destinationBalanceAfter: destinationAfter,
        replayed: false,
      };
    });
  } catch (error) {
    return mapDatabaseError(error);
  }
}
