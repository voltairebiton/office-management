import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
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
    check("offices_code_not_empty", sql`length(btrim(${table.code})) > 0`),
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
    check("rooms_code_not_empty", sql`length(btrim(${table.code})) > 0`),
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
