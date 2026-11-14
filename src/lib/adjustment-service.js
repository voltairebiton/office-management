import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { getDatabase } from "../db/index.js";
import {
  inventoryItems,
  offices,
  stockBalances,
  stockLocations,
  stockMovements,
  stockTransactions,
} from "../db/schema.js";
import { recordAuditEvent } from "./audit-repository.js";
import { assertCapability } from "./authorization.js";
import { hashStockAdjustment, normalizeStockAdjustment } from "./adjustment-validation.js";

const MAX_INTEGER = 2_147_483_647;

function adjustmentError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

function assertOffice(context, operation, officeId) {
  const capability = operation === "count_correction" ? "stock:correct" : "inventory:manage";
  assertCapability(context, capability, { organizationId: context?.organizationId });
  if (!context?.officeIds?.includes(officeId)) {
    throw adjustmentError("NOT_FOUND", "The requested resource was not found.");
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
    throw adjustmentError("CONFLICT", "This stock request changed while it was being saved. Retry safely.");
  }
  if (findDatabaseCode(error, "23503")) {
    throw adjustmentError("NOT_FOUND", "The requested resource was not found.");
  }
  if (findDatabaseCode(error, "23514")) {
    throw adjustmentError("VALIDATION", "The stock quantity is outside the supported range.");
  }
  throw error;
}

async function lockActiveOffice(transaction, context, officeId) {
  const [office] = await transaction.select().from(offices)
    .where(and(eq(offices.organizationId, context.organizationId), eq(offices.id, officeId)))
    .for("update").limit(1);
  if (!office?.isActive) throw adjustmentError("NOT_FOUND", "The requested resource was not found.");
}

async function lockActiveLocation(transaction, context, input) {
  const [location] = await transaction.select().from(stockLocations)
    .where(and(
      eq(stockLocations.organizationId, context.organizationId),
      eq(stockLocations.officeId, input.officeId),
      eq(stockLocations.id, input.locationId),
    )).for("update").limit(1);
  if (!location?.isActive) throw adjustmentError("NOT_FOUND", "The requested resource was not found.");
  return location;
}

async function lockActiveItem(transaction, context, input) {
  const [item] = await transaction.select().from(inventoryItems)
    .where(and(
      eq(inventoryItems.organizationId, context.organizationId),
      eq(inventoryItems.id, input.itemId),
    )).for("update").limit(1);
  if (!item?.isActive) throw adjustmentError("NOT_FOUND", "The requested resource was not found.");
  if (input.operation === "consumption" && item.category !== "consumable") {
    throw adjustmentError("VALIDATION", "Only consumable items can be recorded as used.");
  }
  return item;
}

async function findReversalMovement(transaction, context, input) {
  if (!input.reversalOfMovementId) return null;
  const [movement] = await transaction.select().from(stockMovements)
    .where(and(
      eq(stockMovements.organizationId, context.organizationId),
      eq(stockMovements.officeId, input.officeId),
      eq(stockMovements.locationId, input.locationId),
      eq(stockMovements.itemId, input.itemId),
      eq(stockMovements.id, input.reversalOfMovementId),
    )).limit(1);
  if (!movement) throw adjustmentError("NOT_FOUND", "The original stock movement was not found at this item and location.");
  return movement;
}

async function readAdjustmentResult(database, transactionRow, replayed = true) {
  const [movement] = await database.select().from(stockMovements)
    .where(and(
      eq(stockMovements.organizationId, transactionRow.organizationId),
      eq(stockMovements.transactionId, transactionRow.id),
    )).orderBy(asc(stockMovements.id)).limit(1);
  if (transactionRow.operation === "count_correction") {
    return {
      transactionId: transactionRow.id,
      movement: movement ?? null,
      quantityBefore: transactionRow.quantityBefore,
      quantityAfter: transactionRow.quantityAfter,
      quantityDelta: transactionRow.quantityAfter - transactionRow.quantityBefore,
      balanceVersion: transactionRow.balanceVersion,
      replayed,
    };
  }
  if (!movement) throw adjustmentError("DEPENDENCY_UNAVAILABLE", "The stock adjustment could not be loaded. Retry safely.");
  return {
    transactionId: transactionRow.id,
    movement,
    quantityBefore: movement.balanceAfter - movement.quantityDelta,
    quantityAfter: movement.balanceAfter,
    quantityDelta: movement.quantityDelta,
    balanceVersion: null,
    replayed,
  };
}

async function findExistingAdjustment(database, context, input, payloadHash) {
  const [existing] = await database.select().from(stockTransactions)
    .where(and(
      eq(stockTransactions.organizationId, context.organizationId),
      eq(stockTransactions.operation, input.operation),
      eq(stockTransactions.requestKey, input.requestKey),
    )).limit(1);
  if (!existing) return null;
  if (existing.payloadHash !== payloadHash) {
    throw adjustmentError("CONFLICT", "This request key was already used for a different stock adjustment.");
  }
  return readAdjustmentResult(database, existing);
}

export async function adjustStock(
  context,
  input,
  database = getDatabase(),
  { writeAudit = recordAuditEvent, afterMovement = async () => {}, afterSnapshot = async () => {} } = {},
) {
  const values = normalizeStockAdjustment(input);
  assertOffice(context, values.operation, values.officeId);
  const payloadHash = hashStockAdjustment(values);
  const previous = await findExistingAdjustment(database, context, values, payloadHash);
  if (previous) return previous;

  try {
    return await database.transaction(async (transaction) => {
      // Stock writes in an office all lock its row first, so receipts, transfers, and counts
      // serialize before the expected balance version is checked.
      await lockActiveOffice(transaction, context, values.officeId);
      await lockActiveLocation(transaction, context, values);
      const item = await lockActiveItem(transaction, context, values);
      const reversal = await findReversalMovement(transaction, context, values);
      const afterLock = await findExistingAdjustment(transaction, context, values, payloadHash);
      if (afterLock) return afterLock;

      const [balance] = await transaction.select().from(stockBalances)
        .where(and(
          eq(stockBalances.organizationId, context.organizationId),
          eq(stockBalances.officeId, values.officeId),
          eq(stockBalances.locationId, values.locationId),
          eq(stockBalances.itemId, values.itemId),
        )).for("update").limit(1);
      const quantityBefore = balance?.quantity ?? 0;
      const versionBefore = balance?.version ?? 0;
      if (values.operation === "count_correction" && values.expectedVersion !== versionBefore) {
        throw adjustmentError("CONFLICT", "Stock changed after this count began. Reload the balance and count again.");
      }

      let quantityAfter;
      if (values.operation === "count_correction") quantityAfter = values.countedQuantity;
      else {
        if (quantityBefore < values.quantity) {
          throw adjustmentError("CONFLICT", "There is not enough stock at this location for the adjustment.");
        }
        quantityAfter = quantityBefore - values.quantity;
      }
      const quantityDelta = quantityAfter - quantityBefore;
      if (reversal && (quantityDelta === 0 || Math.sign(quantityDelta) === Math.sign(reversal.quantityDelta))) {
        throw adjustmentError("VALIDATION", "A reversal must change the balance in the opposite direction from the original movement.");
      }
      const hasMovement = quantityDelta !== 0;
      if (hasMovement && versionBefore >= MAX_INTEGER) {
        throw adjustmentError("VALIDATION", "The stock balance version has reached its supported limit.");
      }
      const versionAfter = versionBefore + (hasMovement ? 1 : 0);

      const [stockTransaction] = await transaction.insert(stockTransactions).values({
        organizationId: context.organizationId,
        actorUserId: context.actorUserId,
        actorMembershipId: context.membershipId,
        operation: values.operation,
        requestKey: values.requestKey,
        payloadHash,
        reason: values.reason,
        reference: values.reference,
        quantityBefore: values.operation === "count_correction" ? quantityBefore : null,
        quantityAfter: values.operation === "count_correction" ? quantityAfter : null,
        balanceVersion: values.operation === "count_correction" ? versionAfter : null,
      }).onConflictDoNothing({
        target: [stockTransactions.organizationId, stockTransactions.operation, stockTransactions.requestKey],
      }).returning();
      if (!stockTransaction) {
        const concurrent = await findExistingAdjustment(transaction, context, values, payloadHash);
        if (concurrent) return concurrent;
        throw adjustmentError("CONFLICT", "This stock request changed while it was being saved. Retry safely.");
      }

      let movement = null;
      if (hasMovement) {
        [movement] = await transaction.insert(stockMovements).values({
          organizationId: context.organizationId,
          officeId: values.officeId,
          transactionId: stockTransaction.id,
          actorUserId: context.actorUserId,
          actorMembershipId: context.membershipId,
          locationId: values.locationId,
          itemId: item.id,
          reversalOfMovementId: reversal?.id ?? null,
          movementType: values.operation,
          quantityDelta,
          balanceAfter: quantityAfter,
          itemSku: item.sku,
          itemName: item.name,
          itemCategory: item.category,
          itemUnit: item.unit,
          reason: values.reason,
          reference: values.reference,
        }).returning();
        await afterMovement(movement, transaction);
      }

      if (hasMovement) {
        if (balance) {
          await transaction.update(stockBalances).set({
            quantity: quantityAfter,
            version: versionAfter,
            updatedAt: new Date(),
          }).where(eq(stockBalances.id, balance.id));
        } else {
          await transaction.insert(stockBalances).values({
            organizationId: context.organizationId,
            officeId: values.officeId,
            locationId: values.locationId,
            itemId: item.id,
            quantity: quantityAfter,
            version: versionAfter,
          });
        }
      }
      await afterSnapshot({ stockTransaction, movement, quantityBefore, quantityAfter, quantityDelta, versionAfter }, transaction);
      await writeAudit(transaction, context, {
        operation: values.operation === "consumption" ? "stock.consumed" : values.operation === "damage" ? "stock.damaged" : "stock.count_corrected",
        resourceType: "stock-transaction",
        resourceId: stockTransaction.id,
        requestId: values.requestKey,
        officeId: values.officeId,
        before: { itemSku: item.sku, locationId: values.locationId, quantity: quantityBefore, version: versionBefore },
        after: {
          movementId: movement?.id ?? null,
          reversalOfMovementId: reversal?.id ?? null,
          itemSku: item.sku,
          quantityBefore,
          quantityAfter,
          quantityDelta,
          version: versionAfter,
          reason: values.reason,
          reference: values.reference,
        },
      });
      return {
        transactionId: stockTransaction.id,
        movement,
        quantityBefore,
        quantityAfter,
        quantityDelta,
        balanceVersion: versionAfter,
        replayed: false,
      };
    });
  } catch (error) {
    return mapDatabaseError(error);
  }
}
