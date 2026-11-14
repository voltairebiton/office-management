import "./env.js";
import { sql } from "drizzle-orm";
import { createDatabase } from "../src/db/connection.js";

let connection;
try {
  connection = createDatabase(process.env.DATABASE_URL);
  await connection.db.execute(sql`select 1`);
  const expected = [
    "users",
    "organizations",
    "organization_memberships",
    "offices",
    "office_assignments",
    "rooms",
    "room_assignments",
    "processed_workos_events",
  ];
  const result = await connection.pool.query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[]) order by table_name",
    [expected],
  );
  if (result.rows.length !== expected.length) {
    throw new Error("Run the database migrations first.");
  }
  console.log(
    "Database connection verified; all 8 required tables are present.",
  );
} catch (error) {
  console.error(
    "Database check failed. Check DATABASE_URL and run npm run db:migrate.",
    { code: error.code ?? error.cause?.code ?? "unknown" },
  );
  process.exitCode = 1;
} finally {
  await connection?.pool.end();
}
