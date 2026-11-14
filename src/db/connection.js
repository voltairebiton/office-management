import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export function createDatabase(connectionString) {
  if (!connectionString?.trim()) {
    throw new Error(
      "Set DATABASE_URL in .env.local before using the database.",
    );
  }

  let url;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error("The database connection must be a valid PostgreSQL URL.");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("The database connection must use PostgreSQL.");
  }
  if (url.searchParams.get("sslmode") === "require") {
    url.searchParams.set("sslmode", "verify-full");
  }

  const pool = new Pool({
    connectionString: url.toString(),
    max: 5,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 10000,
    application_name: "office-management",
  });
  pool.on("error", (error) => {
    console.error("An idle database connection failed.", { code: error.code });
  });

  return { db: drizzle(pool, { schema }), pool };
}
