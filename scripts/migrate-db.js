import "./env.js";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "../src/db/connection.js";

let connection;
try {
  connection = createDatabase(
    process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL,
  );
  await migrate(connection.db, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.log("Database migrations applied successfully.");
} catch (error) {
  console.error(
    "Database migration failed. Check the connection and migration files.",
    { code: error.code ?? error.cause?.code ?? "unknown" },
  );
  process.exitCode = 1;
} finally {
  await connection?.pool.end();
}
