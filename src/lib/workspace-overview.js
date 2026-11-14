export function buildWorkspaceOverviewData({
  officeRows = [],
  officeCount = 0,
  roomCounts = [],
  assignedMemberCounts = [],
  assignedEmployeeCount = 0,
  needsResult = { roomCountNeedingSupplies: 0, roomCountNeedingSuppliesByOffice: {}, rows: [] },
  movements = [],
} = {}) {
  const roomsByOffice = new Map(roomCounts.map((row) => [row.officeId, Number(row.count)]));
  const peopleByOffice = new Map(assignedMemberCounts.map((row) => [row.officeId, Number(row.count)]));
  const offices = officeRows.map((office) => ({
    id: office.id,
    name: office.name,
    code: office.code,
    location: office.address || "Address not set",
    rooms: roomsByOffice.get(office.id) ?? 0,
    people: peopleByOffice.get(office.id) ?? 0,
  }));
  const needs = needsResult.rows
    .filter((row) => row.status === "shortage" && Number(row.shortage) > 0)
    .map((row) => ({
      office: row.officeId,
      officeName: row.officeName,
      room: row.roomName,
      item: row.itemName,
      deployed: Number(row.deployed),
      target: Number(row.target),
      unit: row.unit,
    }));

  return {
    live: true,
    officeCount: Number(officeCount),
    roomCount: [...roomsByOffice.values()].reduce((sum, count) => sum + count, 0),
    assignedEmployeeCount: Number(assignedEmployeeCount),
    roomsNeedingSupplies: Number(needsResult.roomCountNeedingSupplies),
    roomCountsByOffice: Object.fromEntries(roomsByOffice),
    peopleCountsByOffice: Object.fromEntries(peopleByOffice),
    roomNeedsByOffice: needsResult.roomCountNeedingSuppliesByOffice ?? {},
    offices,
    needs,
    movements,
    items: [],
    people: [],
  };
}
