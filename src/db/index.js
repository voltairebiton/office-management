import "server-only";
import { createDatabase } from "./connection.js";

const connectionKey = Symbol.for("office-management.database");

export function getDatabase() {
  globalThis[connectionKey] ??= createDatabase(process.env.DATABASE_URL);
  return globalThis[connectionKey].db;
}
