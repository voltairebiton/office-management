// Fictional, public design fixtures. Never query Neon or include real people here.
export const previewWorkspace = {
  offices: [
    { id: "hq", name: "Central Office", code: "HQ", location: "Makati City", rooms: 8, people: 48 },
    { id: "north", name: "North Office", code: "NTH", location: "Quezon City", rooms: 5, people: 26 },
    { id: "south", name: "South Office", code: "STH", location: "Alabang", rooms: 3, people: 18 },
  ],
  needs: [
    { office: "hq", room: "Operations room", item: "Tissue boxes", unit: "boxes", deployed: 2, target: 6 },
    { office: "hq", room: "Meeting room A", item: "Office chairs", unit: "chairs", deployed: 8, target: 10 },
    { office: "north", room: "Reception", item: "Hand sanitizer", unit: "bottles", deployed: 1, target: 3 },
    { office: "south", room: "Team room", item: "Tissue boxes", unit: "boxes", deployed: 4, target: 4 },
  ],
  items: [
    { office: "hq", name: "Tissue boxes", category: "Consumables", unit: "boxes", stock: 42 },
    { office: "hq", name: "Office chairs", category: "Furniture", unit: "chairs", stock: 12 },
    { office: "north", name: "Hand sanitizer", category: "Consumables", unit: "bottles", stock: 18 },
    { office: "south", name: "Tissue boxes", category: "Consumables", unit: "boxes", stock: 24 },
  ],
  movements: [
    { office: "hq", item: "Tissue boxes", kind: "Deployment", quantity: 4, from: "Main storeroom", to: "Operations room", time: "10:42 AM" },
    { office: "north", item: "Hand sanitizer", kind: "Receipt", quantity: 12, from: "Supplier delivery", to: "North storeroom", time: "09:30 AM" },
    { office: "hq", item: "Office chairs", kind: "Transfer", quantity: 2, from: "Main storeroom", to: "Meeting room A", time: "09:15 AM" },
  ],
  people: [
    { office: "hq", name: "Alex Rivera", role: "Office manager", room: "Operations room" },
    { office: "hq", name: "Sam Chen", role: "Employee", room: "Team room" },
    { office: "north", name: "Jordan Lee", role: "Reception", room: "Reception" },
    { office: "south", name: "Casey Cruz", role: "Office helper", room: "Service room" },
  ],
};
