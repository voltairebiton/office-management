import assert from "node:assert/strict";
import test from "node:test";
import { buildWorkspaceOverviewData } from "../../src/lib/workspace-overview.js";

const officeNorth = { id: "office-north", name: "North Office", code: "NTH", address: "Quezon City" };
const officeSouth = { id: "office-south", name: "South Office", code: "STH", address: null };

test("C10-AC2/C10-AC3 builds live overview counts from scoped, distinct aggregates", () => {
  const data = buildWorkspaceOverviewData({
    officeRows: [officeNorth, officeSouth],
    officeCount: 2,
    roomCounts: [{ officeId: officeNorth.id, count: 3 }, { officeId: officeSouth.id, count: 2 }],
    assignedMemberCounts: [{ officeId: officeNorth.id, count: 2 }, { officeId: officeSouth.id, count: 2 }],
    assignedEmployeeCount: 3,
    needsResult: {
      roomCountNeedingSupplies: 1,
      roomCountNeedingSuppliesByOffice: { [officeNorth.id]: 1 },
      rows: [
        { officeId: officeNorth.id, roomId: "room-1", roomName: "Reception", itemName: "Tissues", deployed: 1, target: 3, shortage: 2, status: "shortage", unit: "box" },
        { officeId: officeNorth.id, roomId: "room-1", roomName: "Reception", itemName: "Chairs", deployed: 2, target: 4, shortage: 2, status: "shortage", unit: "piece" },
      ],
    },
    movements: [],
  });

  assert.equal(data.live, true);
  assert.equal(data.officeCount, 2);
  assert.equal(data.roomCount, 5);
  assert.equal(data.assignedEmployeeCount, 3);
  assert.equal(data.roomsNeedingSupplies, 1);
  assert.deepEqual(data.offices.map((office) => [office.id, office.rooms, office.people]), [
    [officeNorth.id, 3, 2],
    [officeSouth.id, 2, 2],
  ]);
  assert.equal(data.needs.length, 2);
  assert.equal(data.needs[0].target, 3);
});

test("C10-AC1/C10-AC8 keeps empty live data distinct from preview fixtures and filters out non-shortages", () => {
  const data = buildWorkspaceOverviewData({
    officeRows: [],
    officeCount: 0,
    roomCounts: [],
    assignedMemberCounts: [],
    assignedEmployeeCount: 0,
    needsResult: {
      roomCountNeedingSupplies: 0,
      roomCountNeedingSuppliesByOffice: {},
      rows: [{ officeId: officeNorth.id, roomId: "room-2", roomName: "Meeting", itemName: "Chairs", deployed: 4, target: 4, shortage: 0, status: "on_target", unit: "piece" }],
    },
    movements: [],
  });
  assert.equal(data.live, true);
  assert.deepEqual(data.offices, []);
  assert.deepEqual(data.needs, []);
  assert.deepEqual(data.movements, []);
  assert.equal(data.roomsNeedingSupplies, 0);
});
