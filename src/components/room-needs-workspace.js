import Link from "next/link";
import { hasCapability } from "@/lib/authorization";
import { listCatalogItems } from "@/lib/catalog-service";
import { getOffice, listOffices, listRooms } from "@/lib/office-service";
import { listRoomNeeds } from "@/lib/room-requirement-service";
import { CreateRoomRequirementForm, RemoveRoomRequirementForm, RoomRequirementTargetForm } from "@/components/room-requirement-forms";

function workspaceUrl(values = {}) {
  const query = new URLSearchParams({ view: "requirements" });
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  return "/dashboard?" + query.toString();
}

function ErrorPanel({ message }) {
  return <div className="om-empty" role="alert"><strong>We couldn’t load room needs.</strong><p>{message}</p></div>;
}

function Status({ row }) {
  const labels = {
    shortage: "Needs " + row.shortage + " " + row.unit,
    on_target: "On target",
    surplus: "Surplus " + row.surplus + " " + row.unit,
    untracked: "No target",
  };
  const className = row.status === "shortage" ? "amber" : row.status === "untracked" ? "muted" : "green";
  return <span className={"ws-status " + className}>{labels[row.status]}</span>;
}

function RoomNeedPagination({ result, filters }) {
  if (result.totalPages < 2) return null;
  return <nav className="om-pagination" aria-label="Room needs pages">
    {result.page > 1 && <Link href={workspaceUrl({ ...filters, page: result.page - 1 })}>Previous</Link>}
    <span>Page {result.page} of {result.totalPages}</span>
    {result.page < result.totalPages && <Link href={workspaceUrl({ ...filters, page: result.page + 1 })}>Next</Link>}
  </nav>;
}

export async function RoomNeedsWorkspace({ context, searchParams = {} }) {
  if (!hasCapability(context, "inventory:read")) {
    return <ErrorPanel message="Your current workspace role does not include access to room inventory." />;
  }
  let offices;
  try {
    offices = await listOffices(context, { status: "active", page: 1, pageSize: 50 });
  } catch {
    return <ErrorPanel message="Refresh the page and try again." />;
  }
  const requestedOffice = typeof searchParams.office === "string" ? searchParams.office : "";
  const officeId = requestedOffice && requestedOffice !== "all" ? requestedOffice : null;
  const targetOfficeId = officeId || offices.rows[0]?.id || "";
  let targetOffice = offices.rows.find((office) => office.id === targetOfficeId) ?? null;
  if (officeId && !targetOffice) {
    try {
      targetOffice = await getOffice(context, officeId);
      offices = { ...offices, rows: [...offices.rows, targetOffice] };
    } catch {
      return <ErrorPanel message="This office is unavailable or outside your active office access." />;
    }
  }
  let rooms = { rows: [], total: 0 };
  let items = { rows: [], total: 0 };
  let needs;
  const filters = {
    office: requestedOffice || "all",
    roomId: searchParams.roomId ?? "",
    itemId: searchParams.itemId ?? "",
    status: searchParams.status ?? "all",
    q: searchParams.q ?? "",
  };
  try {
    [needs, items] = await Promise.all([
      listRoomNeeds(context, {
        officeId: officeId ?? undefined,
        roomId: filters.roomId,
        itemId: filters.itemId,
        status: filters.status,
        q: filters.q,
        page: searchParams.page ?? 1,
        pageSize: 20,
      }),
      listCatalogItems(context, { status: "active", page: 1, pageSize: 50 }),
    ]);
    if (targetOfficeId) {
      rooms = await listRooms(context, targetOfficeId, { status: "active", page: 1, pageSize: 50 });
    }
  } catch (error) {
    return <ErrorPanel message={error?.code === "NOT_FOUND" ? "This office is unavailable or outside your active office access." : "Refresh the page and try again."} />;
  }
  const canManage = hasCapability(context, "requirements:manage");
  return <div className="pm-workspace pm-room-needs-workspace">
    <div className="om-directory-heading">
      <div><p className="om-eyebrow">ROOM INVENTORY</p><h2>Room requirements</h2><p>Compare each room’s target with its current deployed quantity. Assigned headcount is context only.</p></div>
    </div>

    <section className="om-subpanel">
      <div className="om-subpanel-heading"><div><h3>Find room needs</h3><p>{needs.roomCountNeedingSupplies} {needs.roomCountNeedingSupplies === 1 ? "room needs" : "rooms need"} supplies in the current results.</p></div></div>
      <form method="get" action="/dashboard" className="om-form om-form-grid pm-room-needs-filters">
        <input type="hidden" name="view" value="requirements" />
        <label className="om-field"><span>Office</span><select name="office" defaultValue={filters.office}>
          <option value="all">All accessible offices</option>{offices.rows.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
        </select></label>
        <label className="om-field"><span>Room (select an office first)</span><select name="roomId" defaultValue={filters.roomId} disabled={!officeId}>
          <option value="">All rooms</option>{rooms.rows.map((room) => <option key={room.id} value={room.id}>{room.code} · {room.name}</option>)}
        </select></label>
        <label className="om-field"><span>Item</span><select name="itemId" defaultValue={filters.itemId}>
          <option value="">All items</option>{items.rows.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}
        </select></label>
        <label className="om-field"><span>Status</span><select name="status" defaultValue={filters.status}>
          <option value="all">All room inventory</option><option value="shortage">Needs supplies</option><option value="on_target">On target</option><option value="surplus">Surplus</option><option value="untracked">Stock without a target</option>
        </select></label>
        <label className="om-field"><span>Search room or item</span><input name="q" defaultValue={filters.q} maxLength={100} placeholder="Search by name or code" /></label>
        <div className="om-form-actions"><button className="om-primary" type="submit">Apply filters</button><Link href="/dashboard?view=requirements" className="om-secondary-link">Clear filters</Link></div>
      </form>
      {offices.total > offices.rows.length && <p className="pm-muted pm-selector-note">The office filter shows the first 50 accessible offices. Results include all offices when “All accessible offices” is selected.</p>}
    </section>

    {canManage && targetOffice && <section className="om-subpanel">
      <div className="om-subpanel-heading"><div><h3>Add a room target</h3><p>Setting a target never changes stock. New targets apply to {targetOffice.name}.</p></div></div>
      <CreateRoomRequirementForm officeId={targetOffice.id} rooms={rooms.rows} items={items.rows} />
      {(rooms.total > rooms.rows.length || items.total > items.rows.length) && <p className="pm-muted pm-selector-note">The target form shows the first 50 active rooms and items for this office.</p>}
    </section>}

    <section className="om-subpanel">
      <div className="om-subpanel-heading"><div><h3>Room inventory</h3><p>{needs.total} room/item {needs.total === 1 ? "row" : "rows"} · shortages are summarized by item and base unit.</p></div></div>
      {needs.shortagesByItem.length > 0 && <div className="pm-room-shortage-summary" aria-label="Shortage totals by item">
        {needs.shortagesByItem.map((item) => <span key={item.itemId}><strong>{item.itemName}</strong> · {item.shortage} {item.unit} across {item.roomCount} {item.roomCount === 1 ? "room" : "rooms"}</span>)}
      </div>}
      {needs.rows.length ? <div className="pm-stock-table-wrap"><table className="pm-stock-table">
        <caption className="ws-sr-only">Room targets compared with deployed inventory</caption>
        <thead><tr><th>Office / room</th><th>Assigned</th><th>Item</th><th>Deployed</th><th>Target</th><th>Status</th>{canManage && <th>Manage target</th>}<th>Next step</th></tr></thead>
        <tbody>{needs.rows.map((row) => <tr key={row.requirementId ?? row.roomId + ":" + row.itemId}>
          <td><strong>{row.roomName}</strong><small>{row.officeName} · {row.roomCode}</small></td>
          <td>{row.assignedHeadcount}<small>{row.assignedHeadcount === 1 ? "assigned person" : "assigned people"}</small></td>
          <td><strong>{row.itemName}</strong><small>{row.itemSku} · per {row.unit}</small></td>
          <td><strong>{row.deployed}</strong><small>{row.unit}</small></td>
          <td>{row.targetQuantity === null ? "—" : row.targetQuantity}<small>{row.targetQuantity === null ? "No target set" : row.unit}</small></td>
          <td><Status row={row} /></td>
          {canManage && <td><RoomRequirementTargetForm key={row.requirementId ?? row.roomId + ":" + row.itemId} officeId={row.officeId} row={row} />{row.requirementId && <RemoveRoomRequirementForm key={"remove-" + row.requirementId} officeId={row.officeId} row={row} />}</td>}
          <td>{row.status === "shortage" && row.roomLocationId
            ? <Link className="om-open-link" href={"/dashboard?view=inventory&office=" + encodeURIComponent(row.officeId) + "&moveIntent=deployment&moveRoomId=" + encodeURIComponent(row.roomId) + "&moveItemId=" + encodeURIComponent(row.itemId) + "&moveItemSku=" + encodeURIComponent(row.itemSku) + "&moveQuantity=" + row.shortage}>Deploy {row.shortage} {row.unit} <span aria-hidden="true">→</span></Link>
            : row.status === "shortage" ? <span className="pm-muted">Set up this room’s stock location first.</span> : "—"}</td>
        </tr>)}</tbody>
      </table></div> : <div className="om-empty"><strong>{filters.q ? "No room inventory matches these filters" : "No room targets or deployed stock yet"}</strong><p>{filters.q ? "Try a different room or item search." : canManage ? "Add a target above, or deploy stock into a room to start tracking its needs." : "A manager can add room targets or deploy stock to get started."}</p></div>}
      <RoomNeedPagination result={needs} filters={filters} />
    </section>
  </div>;
}
