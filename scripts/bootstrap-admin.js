import "./env.js";
import { createDatabase } from "../src/db/connection.js";
import { createDrizzleIdentityRepository } from "../src/lib/identity-repository.js";
import { bootstrapFirstOrganizationAdmin } from "../src/lib/identity-bootstrap.js";
import { getWorkOSIdentityProvider } from "../src/lib/workos-client.js";

let connection;
try {
  connection = createDatabase(process.env.DATABASE_URL);
  await bootstrapFirstOrganizationAdmin({
    provider: getWorkOSIdentityProvider(),
    repository: createDrizzleIdentityRepository(connection.db),
    userId: process.env.BOOTSTRAP_WORKOS_USER_ID,
    organizationId: process.env.BOOTSTRAP_WORKOS_ORGANIZATION_ID,
  });
  console.log("First organization administrator bootstrap completed.");
} catch (error) {
  console.error("First organization administrator bootstrap failed.", {
    code: error.code ?? "IDENTITY_BOOTSTRAP_FAILED",
  });
  process.exitCode = 1;
} finally {
  await connection?.pool.end();
}
