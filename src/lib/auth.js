import "server-only";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { getAuthConfiguration } from "@/lib/auth-config";

export async function requireUser() {
  if (!getAuthConfiguration().ready) redirect("/setup");
  return withAuth({ ensureSignedIn: true });
}

export async function requireOrganization() {
  const session = await requireUser();
  if (!session.organizationId) redirect("/workspace-required");

  return {
    user: session.user,
    workosOrganizationId: session.organizationId,
    role: session.role,
    permissions: session.permissions ?? [],
  };
}
