import { requireOrganization } from "@/lib/auth";
import { signOutAction } from "@/app/actions";
import { WorkspaceDashboard } from "@/components/workspace-dashboard";
import { canAccessWorkspaceView, resolveView } from "@/lib/workspace-navigation";
import { OfficeWorkspace } from "@/components/office-workspace";
import { PeopleWorkspace } from "@/components/people-workspace";
import { CatalogWorkspace } from "@/components/catalog-workspace";
import { RoomNeedsWorkspace } from "@/components/room-needs-workspace";
import { loadWorkspaceOverview } from "@/lib/workspace-dashboard-service";
import { reportOperationFailure } from "@/lib/diagnostics";

export const metadata = { title: "Workspace" };

export default async function DashboardPage({ searchParams }) {
  const { user, role, authorization, organizationName } = await requireOrganization();
  const params = await searchParams;
  const requestedView = resolveView(params.view);
  const view = requestedView === "overview" && authorization.capabilities.includes("assignments:read:self") && !authorization.capabilities.includes("offices:read")
    ? "people"
    : requestedView;
  const accessDenied = !canAccessWorkspaceView(view, authorization.capabilities);
  let data = { live: true, officeCount: 0, roomCount: 0, assignedEmployeeCount: 0, roomsNeedingSupplies: 0, offices: [], needs: [], movements: [], items: [], people: [] };
  if (["overview", "movements"].includes(view)) {
    try {
      data = await loadWorkspaceOverview(authorization);
    } catch (error) {
      data = { ...data, error: true, errorRequestId: reportOperationFailure(`workspace.${view}`, error) };
    }
  }
  const officeContent = view === "offices" && !accessDenied
    ? <OfficeWorkspace context={authorization} searchParams={params} />
    : null;
  const peopleContent = view === "people" && !accessDenied
    ? <PeopleWorkspace context={authorization} searchParams={params} />
    : null;
  const inventoryContent = view === "inventory" && !accessDenied
    ? <CatalogWorkspace context={authorization} searchParams={params} />
    : null;
  const requirementContent = view === "requirements" && !accessDenied
    ? <RoomNeedsWorkspace context={authorization} searchParams={params} />
    : null;
  return <WorkspaceDashboard view={view} data={data} organizationName={organizationName} capabilities={authorization.capabilities} accessDenied={accessDenied} officeContent={officeContent} peopleContent={peopleContent} inventoryContent={inventoryContent} requirementContent={requirementContent} account={{ name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Team member", email: user.email, role: role || "Member" }} signOutAction={signOutAction} />;
}
