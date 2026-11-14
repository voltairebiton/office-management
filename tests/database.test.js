import "../scripts/env.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createDatabase } from "../src/db/connection.js";

test("Postgres enforces tenant, office, and room assignment constraints", async (t) => {
  const { pool } = createDatabase(process.env.DATABASE_URL);
  let client;
  try {
    client = await pool.connect();
    await client.query("begin");
    const insertId = async (statement, values) =>
      (await client.query(statement + " returning id", values)).rows[0].id;
    const organization = (name) =>
      insertId(
        "insert into organizations (workos_organization_id, name) values ($1, $2)",
        ["test_org_" + randomUUID(), name],
      );
    const user = () =>
      insertId("insert into users (workos_user_id, email) values ($1, $2)", [
        "test_user_" + randomUUID(),
        randomUUID() + "@example.invalid",
      ]);
    const membership = (organizationId, userId) =>
      insertId(
        "insert into organization_memberships (organization_id, user_id, workos_membership_id) values ($1, $2, $3)",
        [organizationId, userId, "test_membership_" + randomUUID()],
      );
    const office = (organizationId, code) =>
      insertId(
        "insert into offices (organization_id, name, code) values ($1, $2, $3)",
        [organizationId, "Test office " + code, code],
      );
    const room = (organizationId, officeId, code) =>
      insertId(
        "insert into rooms (organization_id, office_id, name, code) values ($1, $2, $3, $4)",
        [organizationId, officeId, "Test room " + code, code],
      );
    const officeAccess = (organizationId, officeId, membershipId) =>
      insertId(
        "insert into office_assignments (organization_id, office_id, membership_id) values ($1, $2, $3)",
        [organizationId, officeId, membershipId],
      );
    const roomAssignmentSql =
      "insert into room_assignments (organization_id, office_id, membership_id, room_id) values ($1, $2, $3, $4)";
    const expectConstraint = async (statement, values, code, constraint) => {
      await client.query("savepoint expected_constraint");
      try {
        await assert.rejects(client.query(statement, values), (error) => {
          assert.equal(error.code, code);
          if (constraint) assert.equal(error.constraint, constraint);
          return true;
        });
      } finally {
        await client.query("rollback to savepoint expected_constraint");
        await client.query("release savepoint expected_constraint");
      }
    };

    const orgA = await organization("Constraint test A");
    const orgB = await organization("Constraint test B");
    const userA = await user();
    const userB = await user();
    const memberA = await membership(orgA, userA);
    const memberB = await membership(orgB, userB);
    const memberWithoutAccess = await membership(orgA, userB);
    const officeA = await office(orgA, "HQ");
    const officeA2 = await office(orgA, "SECOND");
    const officeB = await office(orgB, "HQ");
    const roomA = await room(orgA, officeA, "ROOM-A");
    const otherRoomA = await room(orgA, officeA, "ROOM-B");
    const roomA2 = await room(orgA, officeA2, "ROOM-A");
    await officeAccess(orgA, officeA, memberA);
    await officeAccess(orgA, officeA2, memberA);

    await t.test(
      "a member can belong to multiple tenants without gaining active access by default",
      async () => {
        const result = await client.query(
          "select status, role from organization_memberships where id = $1",
          [memberWithoutAccess],
        );
        assert.equal(result.rows[0].status, "pending");
        assert.equal(result.rows[0].role, null);
      },
    );
    await t.test("office codes are tenant-scoped", async () => {
      assert.notEqual(officeA, officeB);
      await expectConstraint(
        "insert into offices (organization_id, name, code) values ($1, 'Duplicate', 'HQ')",
        [orgA],
        "23505",
        "offices_organization_code_key",
      );
    });
    await t.test(
      "office access cannot reference another tenant's member",
      async () => {
        await expectConstraint(
          "insert into office_assignments (organization_id, office_id, membership_id) values ($1, $2, $3)",
          [orgA, officeA, memberB],
          "23503",
          "office_assignments_membership_fk",
        );
      },
    );
    await t.test(
      "office access cannot reference another tenant's office",
      async () => {
        await expectConstraint(
          "insert into office_assignments (organization_id, office_id, membership_id) values ($1, $2, $3)",
          [orgA, officeB, memberA],
          "23503",
          "office_assignments_office_fk",
        );
      },
    );
    await t.test(
      "a room cannot reference another tenant's office",
      async () => {
        await expectConstraint(
          "insert into rooms (organization_id, office_id, name, code) values ($1, $2, 'Invalid', 'INVALID')",
          [orgA, officeB],
          "23503",
          "rooms_office_fk",
        );
      },
    );
    await t.test("room codes are office-scoped", async () => {
      assert.notEqual(roomA, roomA2);
      await expectConstraint(
        "insert into rooms (organization_id, office_id, name, code) values ($1, $2, 'Duplicate', 'ROOM-A')",
        [orgA, officeA],
        "23505",
        "rooms_office_code_key",
      );
    });
    await t.test(
      "room assignment requires an office access record",
      async () => {
        await expectConstraint(
          roomAssignmentSql,
          [orgA, officeA, memberWithoutAccess, roomA],
          "23503",
          "room_assignments_office_access_fk",
        );
      },
    );
    await t.test(
      "room assignment cannot cross offices within one tenant",
      async () => {
        await expectConstraint(
          roomAssignmentSql,
          [orgA, officeA, memberA, roomA2],
          "23503",
          "room_assignments_room_fk",
        );
      },
    );
    await t.test(
      "a member can have one active assigned room in each office",
      async () => {
        await client.query(roomAssignmentSql, [orgA, officeA, memberA, roomA]);
        await client.query(roomAssignmentSql, [
          orgA,
          officeA2,
          memberA,
          roomA2,
        ]);
        await expectConstraint(
          roomAssignmentSql,
          [orgA, officeA, memberA, otherRoomA],
          "23505",
          "room_assignments_one_active_per_office",
        );
      },
    );
    await t.test(
      "reassignment preserves history while keeping one active room",
      async () => {
        await client.query(
          "update room_assignments set ended_at = now() where organization_id = $1 and office_id = $2 and membership_id = $3 and ended_at is null",
          [orgA, officeA, memberA],
        );
        await client.query(roomAssignmentSql, [
          orgA,
          officeA,
          memberA,
          otherRoomA,
        ]);
        const result = await client.query(
          "select count(*)::int as total, count(*) filter (where ended_at is null)::int as active from room_assignments where organization_id = $1 and office_id = $2 and membership_id = $3",
          [orgA, officeA, memberA],
        );
        assert.deepEqual(result.rows[0], { total: 2, active: 1 });
      },
    );
    await t.test("negative room capacity is rejected", async () => {
      await expectConstraint(
        "insert into rooms (organization_id, office_id, name, code, capacity) values ($1, $2, 'Invalid', 'NEGATIVE', -1)",
        [orgA, officeA],
        "23514",
        "rooms_capacity_nonnegative",
      );
    });
    await t.test("an assignment cannot end before it starts", async () => {
      await expectConstraint(
        "insert into room_assignments (organization_id, office_id, membership_id, room_id, started_at, ended_at) values ($1, $2, $3, $4, now(), now() - interval '1 hour')",
        [orgA, officeA, memberA, roomA],
        "23514",
        "room_assignments_valid_dates",
      );
    });
  } finally {
    try {
      await client?.query("rollback");
    } finally {
      client?.release();
      await pool.end();
    }
  }
});
