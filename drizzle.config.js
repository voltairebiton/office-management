import * as nextEnv from "@next/env";
import { defineConfig } from "drizzle-kit";

const { loadEnvConfig } = nextEnv.default ?? nextEnv;
loadEnvConfig(process.cwd());
const migrationUrl =
  process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: "./src/db/schema.js",
  out: "./drizzle",
  dialect: "postgresql",
  ...(migrationUrl ? { dbCredentials: { url: migrationUrl } } : {}),
});
