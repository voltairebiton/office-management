import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "../db/index.js";
import {
  inventoryItems,
  offices,
  organizationMemberships,
  officeAssignments,
  roomAssignments,
  roomStockRequirements,
  rooms,
} from "../db/schema.js";
import { recordAuditEvent } from "./audit-repository.js";
import { assertCapability } from "./authorization.js";
import {
  calculateRoomNeed,
  normalizeRoomNeedsQuery,
  normalizeRoomRequirementInput,
} from "./room-requirement-validation.js";

const MAX_INTEGER = 2_147_483_647;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requirementError(code, message, extra = {}) {
  return Object.assign(new Error(message), { code, ...extra });
}

function assertOffice(context, capability, officeId) {
  assertCapability(context, capability, { organizationId: context?.organizationId });
  if (!context?.officeIds?.includes(officeId)) {
    throw requirementError("NOT_FOUND", "The requested resource was not found.");
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
    throw requirementError("CONFLICT", "This room requirement changed while it was being saved. Reload and try again.");
  }
  if (findDatabaseCode(error, "23503")) {
    throw requirementError("NOT_FOUND", "The requested resource was not found.");
  }
  if (findDatabaseCode(error, "23514")) {
    throw requirementError("VALIDATION", "The room target is outside the supported quantity range.");
  }
  throw error;
}

async function lockActiveOffice(transaction, context, officeId) {
  const [office] = await transaction.select().from(offices)
    .where(and(eq(offices.organizationId, context.organizationId), eq(offices.id, officeId)))
    .for("update").limit(1);
  if (!office?.isActive) throw requirementError("NOT_FOUND", "The requested resource was not found.");
}

async function lockActiveRoom(transaction, context, values) {
  const [room] = await transaction.select().from(rooms)
    .where(and(
      eq(rooms.organizationId, context.organizationId),
      eq(rooms.officeId, values.officeId),
      eq(rooms.id, values.roomId),
    )).for("update").limit(1);
  if (!room?.isActive) throw requirementError("NOT_FOUND", "The requested resource was not found.");
  return room;
}

async function lockActiveItem(transaction, context, values) {
  const [item] = await transaction.select().from(inventoryItems)
    .where(and(
      eq(inventoryItems.organizationId, context.organizationId),
      eq(inventoryItems.id, values.itemId),
    )).for("update").limit(1);
  if (!item?.isActive) throw requirementError("NOT_FOUND", "The requested resource was not found.");
  return item;
}

export async function setRoomRequirement(
  context,
  input,
  database = getDatabase(),
  { writeAudit = recordAuditEvent } = {},
) {
  assertCapability(context, "requirements:manage", { organizationId: context?.organizationId });
  const values = normalizeRoomRequirementInput(input);
  assertOffice(context, "requirements:manage", values.officeId);

  try {
    return await database.transaction(async (transaction) => {
      await lockActiveOffice(transaction, context, values.officeId);
      const room = await lockActiveRoom(transaction, context, values);
      const item = await lockActiveItem(transaction, context, values);
      const [existing] = await transaction.select().from(roomStockRequirements)
        .where(and(
          eq(roomStockRequirements.organizationId, context.organizationId),
          eq(roomStockRequirements.officeId, values.officeId),
          eq(roomStockRequirements.roomId, values.roomId),
          eq(roomStockRequirements.itemId, values.itemId),
        )).for("update").limit(1);

      if (existing?.isActive && existing.targetQuantity === values.targetQuantity) return existing;
      const existingVersion = existing?.version ?? 0;
      const restoringNewTarget = existing && !existing.isActive && values.expectedVersion === 0;
      if (!restoringNewTarget && values.expectedVersion !== existingVersion) {
        throw requirementError("CONFLICT", "This room requirement changed after you opened it. Reload before saving.");
      }
      if (existingVersion >= MAX_INTEGER) {
        throw requirementError("VALIDATION", "This room requirement has reached its supported version limit.");
      }

      const nextVersion = existingVersion + 1;
      const now = new Date(Math.max(Date.now(), (existing?.updatedAt?.getTime() ?? 0) + 1));
      let requirement;
      if (existing) {
        [requirement] = await transaction.update(roomStockRequirements).set({
          targetQuantity: values.targetQuantity,
          version: nextVersion,
          isActive: true,
          updatedAt: now,
        }).where(eq(roomStockRequirements.id, existing.id)).returning();
      } else {
        [requirement] = await transaction.insert(roomStockRequirements).values({
          organizationId: context.organizationId,
          officeId: values.officeId,
          roomId: values.roomId,
          itemId: values.itemId,
          targetQuantity: values.targetQuantity,
          version: 1,
          isActive: true,
        }).returning();
      }

      await writeAudit(transaction, context, {
        operation: existing?.isActive ? "room_stock_requirement.updated" : existing ? "room_stock_requirement.restored" : "room_stock_requirement.created",
        resourceType: "room-stock-requirement",
        resourceId: requirement.id,
        officeId: values.officeId,
        before: existing ? { roomId: existing.roomId, itemId: existing.itemId, targetQuantity: existing.targetQuantity, version: existing.version, isActive: existing.isActive } : null,
        after: { roomId: room.id, itemId: item.id, targetQuantity: requirement.targetQuantity, version: requirement.version, isActive: requirement.isActive },
      });
      return requirement;
    });
  } catch (error) {
    return mapDatabaseError(error);
  }
}

export async function removeRoomRequirement(
  context,
  input,
  database = getDatabase(),
  { writeAudit = recordAuditEvent } = {},
) {
  assertCapability(context, "requirements:manage", { organizationId: context?.organizationId });
  const fieldErrors = {};
  const officeId = typeof input?.officeId === "string" ? input.officeId.toLowerCase() : "";
  const requirementId = typeof input?.requirementId === "string" ? input.requirementId.toLowerCase() : "";
  const expectedVersion = typeof input?.expectedVersion === "number"
    ? input.expectedVersion
    : typeof input?.expectedVersion === "string" && /^\d+$/.test(input.expectedVersion)
      ? Number(input.expectedVersion)
      : NaN;
  if (!UUID_PATTERN.test(officeId)) fieldErrors.officeId = "Choose a valid office.";
  if (!UUID_PATTERN.test(requirementId)) fieldErrors.requirementId = "Choose a valid room requirement.";
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion > MAX_INTEGER) {
    fieldErrors.expectedVersion = "Reload this room requirement before removing it.";
  }
  if (Object.keys(fieldErrors).length) {
    throw requirementError("VALIDATION", "Check the highlighted fields.", { fieldErrors });
  }
  assertOffice(context, "requirements:manage", officeId);

  try {
    return await database.transaction(async (transaction) => {
      await lockActiveOffice(transaction, context, officeId);
      const [existing] = await transaction.select().from(roomStockRequirements)
        .where(and(
          eq(roomStockRequirements.organizationId, context.organizationId),
          eq(roomStockRequirements.officeId, officeId),
          eq(roomStockRequirements.id, requirementId),
        )).for("update").limit(1);
      if (!existing) throw requirementError("NOT_FOUND", "The requested resource was not found.");
      if (!existing.isActive) return existing;
      if (existing.version !== expectedVersion) {
        throw requirementError("CONFLICT", "This room requirement changed after you opened it. Reload before removing it.");
      }
      if (existing.version >= MAX_INTEGER) {
        throw requirementError("VALIDATION", "This room requirement has reached its supported version limit.");
      }
      const [removed] = await transaction.update(roomStockRequirements).set({
        isActive: false,
        version: existing.version + 1,
        updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)),
      }).where(eq(roomStockRequirements.id, existing.id)).returning();
      await writeAudit(transaction, context, {
        operation: "room_stock_requirement.removed",
        resourceType: "room-stock-requirement",
        resourceId: existing.id,
        officeId,
        before: { roomId: existing.roomId, itemId: existing.itemId, targetQuantity: existing.targetQuantity, version: existing.version, isActive: true },
        after: { roomId: existing.roomId, itemId: existing.itemId, targetQuantity: existing.targetQuantity, version: removed.version, isActive: false },
      });
      return removed;
    });
  } catch (error) {
    return mapDatabaseError(error);
  }
}

function numberValue(value) {
  return value === null || value === undefined ? null : Number(value);
}

export async function listRoomNeeds(context, input = {}, database = getDatabase()) {
  assertCapability(context, "inventory:read", { organizationId: context?.organizationId });
  const options = normalizeRoomNeedsQuery(input);
  const officeIds = context?.officeIds ?? [];
  if (options.officeId && !officeIds.includes(options.officeId)) {
    throw requirementError("NOT_FOUND", "The requested resource was not found.");
  }
  const scope = officeIds.length
    ? sql`o.id in (${sql.join(officeIds.map((id) => sql`${id}::uuid`), sql`, `)})`
    : sql`false`;
  const filters = [];
  if (options.officeId) filters.push(sql`office_id = ${options.officeId}::uuid`);
  if (options.roomId) filters.push(sql`room_id = ${options.roomId}::uuid`);
  if (options.itemId) filters.push(sql`item_id = ${options.itemId}::uuid`);
  if (options.status !== "all") filters.push(sql`status = ${options.status}`);
  if (options.query) {
    filters.push(sql`position(lower(${options.query}) in lower(concat_ws(' ', office_name, room_name, room_code, item_name, item_sku))) > 0`);
  }
  const filter = filters.length ? sql.join(filters, sql` and `) : sql`true`;
  const common = sql`with need_rows as (
    select
      o.id as office_id,
      o.name as office_name,
      o.timezone as office_timezone,
      r.id as room_id,
      loc.id as room_location_id,
      r.name as room_name,
      r.code as room_code,
      i.id as item_id,
      i.name as item_name,
      i.sku as item_sku,
      i.unit as item_unit,
      req.id as requirement_id,
      req.target_quantity,
      coalesce(b.quantity, 0)::integer as deployed_quantity,
      req.version as requirement_version,
      (select count(distinct ra.membership_id)::integer
        from room_assignments ra
        inner join organization_memberships m
          on m.organization_id = ra.organization_id and m.id = ra.membership_id and m.status = 'active'
        inner join office_assignments oa
          on oa.organization_id = ra.organization_id and oa.office_id = ra.office_id and oa.membership_id = ra.membership_id and oa.is_active
        where ra.organization_id = r.organization_id and ra.office_id = r.office_id and ra.room_id = r.id and ra.ended_at is null
      ) as assigned_headcount
    from room_stock_requirements req
    inner join offices o on o.organization_id = req.organization_id and o.id = req.office_id and o.is_active
    inner join rooms r on r.organization_id = req.organization_id and r.office_id = req.office_id and r.id = req.room_id and r.is_active
    inner join inventory_items i on i.organization_id = req.organization_id and i.id = req.item_id and i.is_active
    left join stock_locations loc
      on loc.organization_id = req.organization_id and loc.office_id = req.office_id and loc.room_id = req.room_id and loc.kind = 'room' and loc.is_active
    left join stock_balances b
      on b.organization_id = req.organization_id and b.office_id = req.office_id and b.location_id = loc.id and b.item_id = req.item_id
    where req.is_active and o.organization_id = ${context.organizationId}::uuid and ${scope}
    union all
    select
      o.id as office_id,
      o.name as office_name,
      o.timezone as office_timezone,
      r.id as room_id,
      loc.id as room_location_id,
      r.name as room_name,
      r.code as room_code,
      i.id as item_id,
      i.name as item_name,
      i.sku as item_sku,
      i.unit as item_unit,
      null::uuid as requirement_id,
      null::integer as target_quantity,
      b.quantity as deployed_quantity,
      null::integer as requirement_version,
      (select count(distinct ra.membership_id)::integer
        from room_assignments ra
        inner join organization_memberships m
          on m.organization_id = ra.organization_id and m.id = ra.membership_id and m.status = 'active'
        inner join office_assignments oa
          on oa.organization_id = ra.organization_id and oa.office_id = ra.office_id and oa.membership_id = ra.membership_id and oa.is_active
        where ra.organization_id = r.organization_id and ra.office_id = r.office_id and ra.room_id = r.id and ra.ended_at is null
      ) as assigned_headcount
    from stock_balances b
    inner join stock_locations loc on loc.organization_id = b.organization_id and loc.office_id = b.office_id and loc.id = b.location_id and loc.kind = 'room' and loc.is_active
    inner join offices o on o.organization_id = b.organization_id and o.id = b.office_id and o.is_active
    inner join rooms r on r.organization_id = loc.organization_id and r.office_id = loc.office_id and r.id = loc.room_id and r.is_active
    inner join inventory_items i on i.organization_id = b.organization_id and i.id = b.item_id and i.is_active
    left join room_stock_requirements req on req.organization_id = b.organization_id and req.office_id = b.office_id and req.room_id = r.id and req.item_id = i.id and req.is_active
    where b.quantity > 0 and req.id is null and o.organization_id = ${context.organizationId}::uuid and ${scope}
  ), computed as (
    select *,
      case when target_quantity is null then 0 else greatest(target_quantity - deployed_quantity, 0) end::integer as shortage_quantity,
      case when target_quantity is null then deployed_quantity else greatest(deployed_quantity - target_quantity, 0) end::integer as surplus_quantity,
      case when target_quantity is null then 'untracked'
        when target_quantity > deployed_quantity then 'shortage'
        when deployed_quantity > target_quantity then 'surplus'
        else 'on_target'
      end as status
    from need_rows
  ), filtered as (
    select * from computed where ${filter}
  )`;

  const [rowsResult, totalsResult, itemTotalsResult, officeTotalsResult] = await Promise.all([
    database.execute(sql`${common}
      select * from filtered
      order by office_name, room_code, item_sku, room_id, item_id
      limit ${options.pageSize} offset ${options.offset}`),
    database.execute(sql`${common}
      select count(*)::integer as total,
        count(distinct room_id) filter (where shortage_quantity > 0)::integer as room_count_needing_supplies
      from filtered`),
    database.execute(sql`${common}
      select item_id, item_name, item_sku, item_unit,
        sum(shortage_quantity)::integer as shortage,
        count(distinct room_id) filter (where shortage_quantity > 0)::integer as room_count
      from filtered
      where shortage_quantity > 0
      group by item_id, item_name, item_sku, item_unit
      order by item_sku, item_id`),
    database.execute(sql`${common}
      select office_id,
        count(distinct room_id) filter (where shortage_quantity > 0)::integer as room_count
      from filtered
      group by office_id`),
  ]);
  const rows = rowsResult.rows.map((row) => {
    const target = numberValue(row.target_quantity);
    const need = calculateRoomNeed(target, Number(row.deployed_quantity));
    return {
      officeId: row.office_id,
      officeName: row.office_name,
      officeTimezone: row.office_timezone,
      roomId: row.room_id,
      roomLocationId: row.room_location_id,
      roomName: row.room_name,
      roomCode: row.room_code,
      itemId: row.item_id,
      itemName: row.item_name,
      itemSku: row.item_sku,
      unit: row.item_unit,
      requirementId: row.requirement_id,
      requirementVersion: numberValue(row.requirement_version),
      assignedHeadcount: Number(row.assigned_headcount),
      ...need,
    };
  });
  const total = Number(totalsResult.rows[0]?.total ?? 0);
  return {
    rows,
    total,
    page: options.page,
    pageSize: options.pageSize,
    totalPages: Math.ceil(total / options.pageSize),
    roomCountNeedingSupplies: Number(totalsResult.rows[0]?.room_count_needing_supplies ?? 0),
    roomCountNeedingSuppliesByOffice: Object.fromEntries(officeTotalsResult.rows.map((row) => [row.office_id, Number(row.room_count)])),
    shortagesByItem: itemTotalsResult.rows.map((row) => ({
      itemId: row.item_id,
      itemName: row.item_name,
      itemSku: row.item_sku,
      unit: row.item_unit,
      shortage: Number(row.shortage),
      roomCount: Number(row.room_count),
    })),
  };
}
