import { requireOrganization } from "@/lib/auth";
import { signOutAction } from "@/app/actions";
import { WorkspaceDashboard } from "@/components/workspace-dashboard";
import { resolveView } from "@/lib/workspace-navigation";

export const metadata = { title: "Workspace" };

export default async function DashboardPage({ searchParams }) {
  const { user, role } = await requireOrganization();
  const { view } = await searchParams;
  return <WorkspaceDashboard view={resolveView(view)} account={{ name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Team member", email: user.email, role: role || "Member" }} signOutAction={signOutAction} />;
}
