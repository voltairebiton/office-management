import "server-only";
import { eq } from "drizzle-orm";
import { getDatabase } from "../db/index.js";
import { organizations } from "../db/schema.js";
import { recordAuditEvent } from "./audit-repository.js";
import { assertCapability } from "./authorization.js";
import { normalizeWorkspaceName } from "./workspace-settings-validation.js";

function settingsError(code, message) {
  return Object.assign(new Error(message), { code });
}

export async function renameWorkspace(
  context,
  { workosOrganizationId, name, expectedName },
  provider,
  database = getDatabase(),
  { writeAudit = recordAuditEvent } = {},
) {
  assertCapability(context, "tenant:manage", { organizationId: context?.organizationId });
  const normalizedName = normalizeWorkspaceName(name);
  if (typeof expectedName !== "string" || !expectedName.trim()) {
    throw settingsError("VALIDATION", "Reload the workspace settings and try again.");
  }
  if (typeof workosOrganizationId !== "string" || !workosOrganizationId.trim() || !provider?.updateOrganizationName) {
    throw settingsError("DEPENDENCY_UNAVAILABLE", "Workspace settings are unavailable. Retry the request.");
  }

  return database.transaction(async (transaction) => {
    const [organization] = await transaction.select().from(organizations)
      .where(eq(organizations.id, context.organizationId))
      .for("update").limit(1);
    if (!organization || organization.workosOrganizationId !== workosOrganizationId) {
      throw settingsError("NOT_FOUND", "The requested resource was not found.");
    }
    if (organization.name !== expectedName) {
      throw settingsError("CONFLICT", "This workspace name changed after you opened settings. Reload before saving.");
    }
    if (organization.name === normalizedName) return organization;

    const providerOrganization = await provider.updateOrganizationName({
      organizationId: workosOrganizationId,
      name: normalizedName,
    });
    if (providerOrganization?.id !== workosOrganizationId || providerOrganization?.name !== normalizedName) {
      throw settingsError("DEPENDENCY_UNAVAILABLE", "WorkOS did not confirm the workspace name change. Retry the request.");
    }
    const [updated] = await transaction.update(organizations).set({
      name: normalizedName,
      updatedAt: new Date(),
    }).where(eq(organizations.id, organization.id)).returning();
    await writeAudit(transaction, context, {
      operation: "workspace.name.updated",
      resourceType: "organization",
      resourceId: organization.id,
      before: { name: organization.name },
      after: { name: updated.name },
    });
    return updated;
  });
}
