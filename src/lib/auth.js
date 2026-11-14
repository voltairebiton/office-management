import "server-only";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { getAuthConfiguration } from "@/lib/auth-config";
import { syncIdentityFromSession } from "@/lib/identity-sync";
import { createDrizzleIdentityRepository } from "@/lib/identity-repository";
import { getWorkOSIdentityProvider } from "@/lib/workos-client";
import { loadAuthorizationContext } from "@/lib/authorization-context";

export async function requireUser() {
  if (!getAuthConfiguration().ready) redirect("/setup");
  return withAuth({ ensureSignedIn: true });
}

export async function requireOrganization() {
  const session = await requireUser();
  if (!session.organizationId) redirect("/workspace-required");

  let identity;
  let authorization;
  try {
    identity = await syncIdentityFromSession({
      session,
      provider: getWorkOSIdentityProvider(),
      repository: createDrizzleIdentityRepository(),
    });
    authorization = await loadAuthorizationContext({
      actorUserId: identity.user.id,
      organizationId: identity.organization.id,
      membershipId: identity.membership.id,
    });
  } catch {
    redirect("/auth/error?code=workspace-verification-failed");
  }
  if (!authorization.active) redirect("/access-denied");

  return {
    user: session.user,
    workosOrganizationId: session.organizationId,
    organizationId: identity.organization.id,
    membershipId: identity.membership.id,
    role: authorization.role,
    capabilities: authorization.capabilities,
    officeIds: authorization.officeIds,
    authorization,
  };
}
