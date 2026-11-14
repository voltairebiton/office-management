import { requireOrganization } from "@/lib/auth";
import { signOutAction } from "@/app/actions";
import { WorkspaceDashboard } from "@/components/workspace-dashboard";
import { resolveView } from "@/lib/workspace-navigation";
import { OfficeWorkspace } from "@/components/office-workspace";
import { PeopleWorkspace } from "@/components/people-workspace";
import { CatalogWorkspace } from "@/components/catalog-workspace";

export const metadata = { title: "Workspace" };

export default async function DashboardPage({ searchParams }) {
  const { user, role, authorization } = await requireOrganization();
  const params = await searchParams;
  const view = resolveView(params.view);
  const officeContent = view === "offices"
    ? <OfficeWorkspace context={authorization} searchParams={params} />
    : null;
  const peopleContent = view === "people"
    ? <PeopleWorkspace context={authorization} searchParams={params} />
    : null;
  const inventoryContent = view === "inventory"
    ? <CatalogWorkspace context={authorization} searchParams={params} />
    : null;
  return <WorkspaceDashboard view={view} officeContent={officeContent} peopleContent={peopleContent} inventoryContent={inventoryContent} account={{ name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Team member", email: user.email, role: role || "Member" }} signOutAction={signOutAction} />;
}
