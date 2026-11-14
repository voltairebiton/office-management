import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const primaryId = () => uuid("id").defaultRandom().primaryKey();
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const membershipStatus = pgEnum("membership_status", [
  "pending",
  "active",
  "inactive",
]);

export const inventoryItemCategory = pgEnum("inventory_item_category", [
  "consumable",
  "reusable",
]);

export const stockLocationKind = pgEnum("stock_location_kind", [
  "storage",
  "room",
]);

export const stockTransactionOperation = pgEnum("stock_transaction_operation", [
  "receipt",
  "transfer",
  "consumption",
  "damage",
  "count_correction",
]);

export const stockMovementType = pgEnum("stock_movement_type", [
  "receipt",
  "deployment",
  "return",
  "transfer_out",
  "transfer_in",
  "consumption",
  "damage",
  "count_correction",
]);

export const users = pgTable("users", {
  id: primaryId(),
  workosUserId: text("workos_user_id").notNull().unique(),
  displayName: text("display_name"),
  email: text("email").notNull(),
  ...timestamps(),
});

export const organizations = pgTable(
  "organizations",
  {
    id: primaryId(),
    workosOrganizationId: text("workos_organization_id").notNull().unique(),
    name: text("name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    check(
      "organizations_name_not_empty",
      sql`length(btrim(${table.name})) > 0`,
    ),
  ],
);

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    workosMembershipId: text("workos_membership_id").notNull().unique(),
    status: membershipStatus("status").default("pending").notNull(),
    role: text("role"),
    grantedCapabilities: text("granted_capabilities")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("memberships_organization_id_key").on(
      table.organizationId,
      table.id,
    ),
    unique("memberships_organization_user_key").on(
      table.organizationId,
      table.userId,
    ),
    unique("memberships_organization_user_membership_key").on(
      table.organizationId,
      table.userId,
      table.id,
    ),
    index("memberships_user_idx").on(table.userId),
  ],
);

export const offices = pgTable(
  "offices",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    code: text("code").notNull(),
    timezone: text("timezone").default("UTC").notNull(),
    address: text("address"),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("offices_organization_id_key").on(table.organizationId, table.id),
    unique("offices_organization_code_key").on(
      table.organizationId,
      table.code,
    ),
    check("offices_name_not_empty", sql`length(btrim(${table.name})) > 0`),
    check("offices_name_max_length", sql`length(${table.name}) <= 120`),
    check("offices_code_format", sql`${table.code} ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'`),
    check("offices_address_max_length", sql`${table.address} is null or length(${table.address}) <= 240`),
  ],
);

export const officeAssignments = pgTable(
  "office_assignments",
  {
    id: primaryId(),
    organizationId: uuid("organization_id").notNull(),
    officeId: uuid("office_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("office_assignments_office_member_key").on(
      table.organizationId,
      table.officeId,
      table.membershipId,
    ),
    foreignKey({
      name: "office_assignments_office_fk",
      columns: [table.organizationId, table.officeId],
      foreignColumns: [offices.organizationId, offices.id],
    }),
    foreignKey({
      name: "office_assignments_membership_fk",
      columns: [table.organizationId, table.membershipId],
      foreignColumns: [
        organizationMemberships.organizationId,
        organizationMemberships.id,
      ],
    }),
    index("office_assignments_member_idx").on(
      table.organizationId,
      table.membershipId,
    ),
  ],
);

export const rooms = pgTable(
  "rooms",
  {
    id: primaryId(),
    organizationId: uuid("organization_id").notNull(),
    officeId: uuid("office_id").notNull(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    capacity: integer("capacity"),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("rooms_office_id_key").on(
      table.organizationId,
      table.officeId,
      table.id,
    ),
    unique("rooms_office_code_key").on(
      table.organizationId,
      table.officeId,
      table.code,
    ),
    foreignKey({
      name: "rooms_office_fk",
      columns: [table.organizationId, table.officeId],
      foreignColumns: [offices.organizationId, offices.id],
    }),
    check("rooms_capacity_nonnegative", sql`${table.capacity} >= 0`),
    check("rooms_name_not_empty", sql`length(btrim(${table.name})) > 0`),
    check("rooms_name_max_length", sql`length(${table.name}) <= 120`),
    check("rooms_code_format", sql`${table.code} ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'`),
  ],
);

export const roomAssignments = pgTable(
  "room_assignments",
  {
    id: primaryId(),
    organizationId: uuid("organization_id").notNull(),
    officeId: uuid("office_id").notNull(),
    membershipId: uuid("membership_id").notNull(),
    roomId: uuid("room_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    foreignKey({
      name: "room_assignments_office_access_fk",
      columns: [table.organizationId, table.officeId, table.membershipId],
      foreignColumns: [
        officeAssignments.organizationId,
        officeAssignments.officeId,
        officeAssignments.membershipId,
      ],
    }),
    foreignKey({
      name: "room_assignments_room_fk",
      columns: [table.organizationId, table.officeId, table.roomId],
      foreignColumns: [rooms.organizationId, rooms.officeId, rooms.id],
    }),
    uniqueIndex("room_assignments_one_active_per_office")
      .on(table.organizationId, table.officeId, table.membershipId)
      .where(sql`${table.endedAt} is null`),
    index("room_assignments_active_headcount_idx")
      .on(table.organizationId, table.officeId, table.roomId)
      .where(sql`${table.endedAt} is null`),
    check(
      "room_assignments_valid_dates",
      sql`${table.endedAt} is null or ${table.endedAt} >= ${table.startedAt}`,
    ),
  ],
);

export const processedWorkOSEvents = pgTable("processed_workos_events", {
  workosEventId: text("workos_event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  providerCreatedAt: timestamp("provider_created_at", { withTimezone: true }),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: primaryId(),
    organizationId: uuid("organization_id").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    actorMembershipId: uuid("actor_membership_id").notNull(),
    officeId: uuid("office_id"),
    operation: text("operation").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    requestId: text("request_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: "audit_events_actor_membership_fk",
      columns: [table.organizationId, table.actorUserId, table.actorMembershipId],
      foreignColumns: [
        organizationMemberships.organizationId,
        organizationMemberships.userId,
        organizationMemberships.id,
      ],
    }),
    foreignKey({
      name: "audit_events_office_fk",
      columns: [table.organizationId, table.officeId],
      foreignColumns: [offices.organizationId, offices.id],
    }),
    index("audit_events_organization_created_idx").on(
      table.organizationId,
      table.createdAt.desc(),
    ),
    check("audit_events_operation_not_empty", sql`length(btrim(${table.operation})) > 0`),
    check("audit_events_resource_type_not_empty", sql`length(btrim(${table.resourceType})) > 0`),
    check("audit_events_resource_id_not_empty", sql`length(btrim(${table.resourceId})) > 0`),
  ],
);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: primaryId(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    category: inventoryItemCategory("category").notNull(),
    unit: text("unit").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("inventory_items_organization_id_key").on(table.organizationId, table.id),
    unique("inventory_items_organization_sku_key").on(table.organizationId, table.sku),
    check("inventory_items_sku_format", sql`${table.sku} ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'`),
    check("inventory_items_name_not_empty", sql`length(btrim(${table.name})) > 0`),
    check("inventory_items_name_max_length", sql`length(${table.name}) <= 120`),
    check("inventory_items_unit_format", sql`${table.unit} ~ '^[a-z][a-z0-9_-]{0,23}$'`),
  ],
);

export const stockLocations = pgTable(
  "stock_locations",
  {
    id: primaryId(),
    organizationId: uuid("organization_id").notNull(),
    officeId: uuid("office_id").notNull(),
    roomId: uuid("room_id"),
    kind: stockLocationKind("kind").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("stock_locations_office_id_key").on(table.organizationId, table.officeId, table.id),
    unique("stock_locations_office_code_key").on(table.organizationId, table.officeId, table.code),
    unique("stock_locations_one_per_room_key").on(table.organizationId, table.officeId, table.roomId),
    foreignKey({
      name: "stock_locations_office_fk",
      columns: [table.organizationId, table.officeId],
      foreignColumns: [offices.organizationId, offices.id],
    }),
    foreignKey({
      name: "stock_locations_room_fk",
      columns: [table.organizationId, table.officeId, table.roomId],
      foreignColumns: [rooms.organizationId, rooms.officeId, rooms.id],
    }),
    check("stock_locations_code_format", sql`${table.code} ~ '^[A-Z0-9][A-Z0-9_-]{0,36}$'`),
    check("stock_locations_name_not_empty", sql`length(btrim(${table.name})) > 0`),
    check("stock_locations_name_max_length", sql`length(${table.name}) <= 120`),
    check("stock_locations_kind_room_consistency", sql`(${table.kind} = 'room' and ${table.roomId} is not null) or (${table.kind} = 'storage' and ${table.roomId} is null)`),
  ],
);

export const stockTransactions = pgTable(
  "stock_transactions",
  {
    id: primaryId(),
    organizationId: uuid("organization_id").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    actorMembershipId: uuid("actor_membership_id").notNull(),
    operation: stockTransactionOperation("operation").notNull(),
    requestKey: uuid("request_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    reason: text("reason").notNull(),
    reference: text("reference"),
    quantityBefore: integer("quantity_before"),
    quantityAfter: integer("quantity_after"),
    balanceVersion: integer("balance_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("stock_transactions_organization_id_key").on(table.organizationId, table.id),
    unique("stock_transactions_request_key_key").on(table.organizationId, table.operation, table.requestKey),
    foreignKey({
      name: "stock_transactions_actor_membership_fk",
      columns: [table.organizationId, table.actorUserId, table.actorMembershipId],
      foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId, organizationMemberships.id],
    }),
    check("stock_transactions_payload_hash_format", sql`${table.payloadHash} ~ '^[a-f0-9]{64}$'`),
    check("stock_transactions_reason_not_empty", sql`length(btrim(${table.reason})) > 0`),
    check("stock_transactions_reason_max_length", sql`length(${table.reason}) <= 120`),
    check("stock_transactions_reference_max_length", sql`${table.reference} is null or length(${table.reference}) <= 120`),
    check("stock_transactions_count_snapshot", sql`(${table.operation} = 'count_correction' and ${table.quantityBefore} is not null and ${table.quantityAfter} is not null and ${table.balanceVersion} is not null) or (${table.operation} <> 'count_correction' and ${table.quantityBefore} is null and ${table.quantityAfter} is null and ${table.balanceVersion} is null)`),
    check("stock_transactions_count_values_nonnegative", sql`${table.quantityBefore} is null or ${table.quantityBefore} >= 0`),
    check("stock_transactions_count_after_nonnegative", sql`${table.quantityAfter} is null or ${table.quantityAfter} >= 0`),
    check("stock_transactions_count_version_nonnegative", sql`${table.balanceVersion} is null or ${table.balanceVersion} >= 0`),
  ],
);

export const stockBalances = pgTable(
  "stock_balances",
  {
    id: primaryId(),
    organizationId: uuid("organization_id").notNull(),
    officeId: uuid("office_id").notNull(),
    locationId: uuid("location_id").notNull(),
    itemId: uuid("item_id").notNull(),
    quantity: integer("quantity").default(0).notNull(),
    version: integer("version").default(0).notNull(),
    ...timestamps(),
  },
  (table) => [
    unique("stock_balances_organization_id_key").on(table.organizationId, table.id),
    unique("stock_balances_location_item_key").on(table.organizationId, table.officeId, table.locationId, table.itemId),
    foreignKey({
      name: "stock_balances_location_fk",
      columns: [table.organizationId, table.officeId, table.locationId],
      foreignColumns: [stockLocations.organizationId, stockLocations.officeId, stockLocations.id],
    }),
    foreignKey({
      name: "stock_balances_item_fk",
      columns: [table.organizationId, table.itemId],
      foreignColumns: [inventoryItems.organizationId, inventoryItems.id],
    }),
    check("stock_balances_quantity_nonnegative", sql`${table.quantity} >= 0`),
    check("stock_balances_version_nonnegative", sql`${table.version} >= 0`),
    index("stock_balances_office_location_idx").on(table.organizationId, table.officeId, table.locationId),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: primaryId(),
    organizationId: uuid("organization_id").notNull(),
    officeId: uuid("office_id").notNull(),
    transactionId: uuid("transaction_id").notNull(),
    actorUserId: uuid("actor_user_id").notNull(),
    actorMembershipId: uuid("actor_membership_id").notNull(),
    locationId: uuid("location_id").notNull(),
    itemId: uuid("item_id").notNull(),
    reversalOfMovementId: uuid("reversal_of_movement_id"),
    movementType: stockMovementType("movement_type").notNull(),
    quantityDelta: integer("quantity_delta").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    itemSku: text("item_sku").notNull(),
    itemName: text("item_name").notNull(),
    itemCategory: inventoryItemCategory("item_category").notNull(),
    itemUnit: text("item_unit").notNull(),
    reason: text("reason").notNull(),
    reference: text("reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("stock_movements_transaction_id_key").on(table.organizationId, table.id),
    foreignKey({
      name: "stock_movements_transaction_fk",
      columns: [table.organizationId, table.transactionId],
      foreignColumns: [stockTransactions.organizationId, stockTransactions.id],
    }),
    foreignKey({
      name: "stock_movements_reversal_fk",
      columns: [table.organizationId, table.reversalOfMovementId],
      foreignColumns: [table.organizationId, table.id],
    }),
    foreignKey({
      name: "stock_movements_actor_membership_fk",
      columns: [table.organizationId, table.actorUserId, table.actorMembershipId],
      foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId, organizationMemberships.id],
    }),
    foreignKey({
      name: "stock_movements_location_fk",
      columns: [table.organizationId, table.officeId, table.locationId],
      foreignColumns: [stockLocations.organizationId, stockLocations.officeId, stockLocations.id],
    }),
    foreignKey({
      name: "stock_movements_item_fk",
      columns: [table.organizationId, table.itemId],
      foreignColumns: [inventoryItems.organizationId, inventoryItems.id],
    }),
    check("stock_movements_quantity_delta_nonzero", sql`${table.quantityDelta} <> 0`),
    check("stock_movements_receipt_positive", sql`${table.movementType} <> 'receipt' or ${table.quantityDelta} > 0`),
    check("stock_movements_transfer_out_negative", sql`${table.movementType} <> 'transfer_out' or ${table.quantityDelta} < 0`),
    check("stock_movements_transfer_in_positive", sql`${table.movementType} <> 'transfer_in' or ${table.quantityDelta} > 0`),
    check("stock_movements_balance_nonnegative", sql`${table.balanceAfter} >= 0`),
    check("stock_movements_item_sku_format", sql`${table.itemSku} ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'`),
    check("stock_movements_item_name_not_empty", sql`length(btrim(${table.itemName})) > 0`),
    check("stock_movements_item_unit_format", sql`${table.itemUnit} ~ '^[a-z][a-z0-9_-]{0,23}$'`),
    check("stock_movements_reason_not_empty", sql`length(btrim(${table.reason})) > 0`),
    check("stock_movements_reference_max_length", sql`${table.reference} is null or length(${table.reference}) <= 120`),
    index("stock_movements_office_created_idx").on(table.organizationId, table.officeId, table.createdAt.desc()),
    index("stock_movements_item_created_idx").on(table.organizationId, table.itemId, table.createdAt.desc()),
  ],
);
