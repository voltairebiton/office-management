import assert from "node:assert/strict";
import test from "node:test";
import { resolveTestDatabaseUrl } from "../../scripts/test-database-config.js";

test("C00-AC1 isolated integration database configuration", async (t) => {
  const safeTestUrl = "postgresql://test_user:test_password@localhost:5433/office_test";
  await t.test("requires an explicit test database URL", () => {
    assert.throws(
      () => resolveTestDatabaseUrl({}),
      { code: "TEST_DATABASE_URL_REQUIRED" },
    );
  });
  await t.test("rejects malformed or non-Postgres URLs", () => {
    assert.throws(
      () => resolveTestDatabaseUrl({ testDatabaseUrl: "postgres://" }),
      { code: "TEST_DATABASE_URL_INVALID" },
    );
    assert.throws(
      () => resolveTestDatabaseUrl({ testDatabaseUrl: "https://example.invalid" }),
      { code: "TEST_DATABASE_URL_INVALID" },
    );
  });
  await t.test("refuses the application database even if explicitly set as test URL", () => {
    const applicationUrl = "postgresql://app:secret@db.example.invalid/office";
    assert.throws(
      () => resolveTestDatabaseUrl({
        testDatabaseUrl: applicationUrl,
        databaseUrl: applicationUrl,
      }),
      { code: "TEST_DATABASE_TARGET_IS_APPLICATION_DATABASE" },
    );
  });
  await t.test("refuses a test URL matching either configured application endpoint", () => {
    assert.throws(
      () => resolveTestDatabaseUrl({
        testDatabaseUrl: safeTestUrl,
        directDatabaseUrl: safeTestUrl,
      }),
      { code: "TEST_DATABASE_TARGET_IS_APPLICATION_DATABASE" },
    );
  });
  await t.test("allows a different database on the same PostgreSQL server", () => {
    assert.equal(
      resolveTestDatabaseUrl({
        testDatabaseUrl: "postgresql://test:test@localhost:5432/office_test",
        databaseUrl: "postgresql://app:secret@localhost:5432/office",
      }),
      "postgresql://test:test@localhost:5432/office_test",
    );
  });
  await t.test("allows a separate database and returns only its connection URL", () => {
    assert.equal(
      resolveTestDatabaseUrl({
        testDatabaseUrl: safeTestUrl,
        databaseUrl: "postgresql://app:secret@db.example.invalid/office",
      }),
      safeTestUrl,
    );
  });
  await t.test("error messages never include connection credentials", () => {
    const secretUrl = "postgresql://app:must-not-leak@db.example.invalid/office";
    try {
      resolveTestDatabaseUrl({ testDatabaseUrl: secretUrl, databaseUrl: secretUrl });
      assert.fail("Expected an unsafe-target rejection.");
    } catch (error) {
      assert.doesNotMatch(error.message, /must-not-leak|db\.example/);
    }
  });
});
