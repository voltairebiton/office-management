import { WorkspaceDashboard } from "@/components/workspace-dashboard";
import { previewWorkspace } from "@/lib/preview-workspace";
import { resolveView } from "@/lib/workspace-navigation";

export const metadata = { title: "Dashboard preview", robots: { index: false, follow: false } };

export default async function PreviewPage({ searchParams }) {
  const { view } = await searchParams;
  return <WorkspaceDashboard view={resolveView(view)} preview data={previewWorkspace} account={{ name: "Alex Rivera", email: "Fictional preview account", role: "Office manager" }} />;
}
