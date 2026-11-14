import "../scripts/env.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createDatabase } from "../src/db/connection.js";
import { resolveTestDatabaseUrl } from "../scripts/test-database-config.js";

test("C00-AC2 committed fixtures are visible across connections and cleaned by ID", async () => {
  const testDatabaseUrl = resolveTestDatabaseUrl({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    directDatabaseUrl: process.env.DIRECT_DATABASE_URL,
  });
  const { pool } = createDatabase(testDatabaseUrl);
  const workosOrganizationId = `test_org_${randomUUID()}`;
  let organizationId;

  try {
    const writer = await pool.connect();
    try {
      const inserted = await writer.query(
        "insert into organizations (workos_organization_id, name) values ($1, $2) returning id",
        [workosOrganizationId, "Committed connection smoke fixture"],
      );
      organizationId = inserted.rows[0].id;
    } finally {
      writer.release();
    }

    const reader = await pool.connect();
    try {
      const selected = await reader.query(
        "select name from organizations where id = $1 and workos_organization_id = $2",
        [organizationId, workosOrganizationId],
      );
      assert.deepEqual(selected.rows, [
        { name: "Committed connection smoke fixture" },
      ]);
    } finally {
      reader.release();
    }
  } finally {
    if (organizationId) {
      await pool.query("delete from organizations where id = $1", [organizationId]);
    }
    await pool.end();
  }
});
