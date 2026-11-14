export const navigation = [
  { label: "Workspace", items: [
    { id: "overview", label: "Overview", icon: "overview" },
    { id: "offices", label: "Offices & rooms", icon: "building" },
    { id: "people", label: "People", icon: "people" },
  ] },
  { label: "Inventory", items: [
    { id: "inventory", label: "Catalog & stock", icon: "box" },
    { id: "requirements", label: "Room requirements", icon: "check" },
    { id: "movements", label: "Stock movements", icon: "transfer" },
  ] },
  { label: "Services", items: [
    { id: "refreshments", label: "Refreshments", icon: "coffee", planned: true },
    { id: "visitors", label: "Visitors", icon: "visitor", planned: true },
  ] },
  { label: "Administration", items: [
    { id: "settings", label: "Workspace settings", icon: "settings" },
  ] },
];
export const workspaceViews = Object.fromEntries(navigation.flatMap(group => group.items).map(item => [item.id, item]));
export function resolveView(value) {
  return typeof value === "string" && Object.hasOwn(workspaceViews, value) ? value : "overview";
}
