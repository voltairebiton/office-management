import "./env.js";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../src/db/connection.js";
import { resolveTestDatabaseUrl } from "./test-database-config.js";

let connection;
try {
  const testDatabaseUrl = resolveTestDatabaseUrl({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    databaseUrl: process.env.DATABASE_URL,
    directDatabaseUrl: process.env.DIRECT_DATABASE_URL,
  });
  connection = createDatabase(testDatabaseUrl);
  await migrate(connection.db, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.log("Isolated test database migrations applied successfully.");
} catch (error) {
  console.error("Test database migration failed.", {
    code: error.code ?? error.cause?.code ?? "unknown",
  });
  process.exitCode = 1;
} finally {
  await connection?.pool.end();
}
