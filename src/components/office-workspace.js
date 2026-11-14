import Link from "next/link";
import { ArchiveOfficeForm, ArchiveRoomForm, OfficeForm, RoomForm } from "@/components/office-forms";
import { hasCapability } from "@/lib/authorization";
import { getOffice, listOffices, listRooms } from "@/lib/office-service";

function officeHref(officeId, searchParams) {
  const params = new URLSearchParams({ view: "offices", office: officeId });
  if (searchParams.q) params.set("q", searchParams.q);
  if (searchParams.status) params.set("status", searchParams.status);
  return `/dashboard?${params.toString()}`;
}

function ErrorPanel({ message }) {
  return <div className="om-empty" role="alert"><strong>We couldn’t load this office view.</strong><p>{message}</p></div>;
}

export async function OfficeWorkspace({ context, searchParams = {} }) {
  if (!hasCapability(context, "offices:read")) {
    return <ErrorPanel message="Your current workspace role does not include access to the office directory." />;
  }
  let directory;
  try {
    directory = await listOffices(context, {
      q: searchParams.q ?? "",
      page: searchParams.page ?? 1,
      pageSize: 20,
      status: searchParams.status ?? "active",
    });
  } catch {
    return <ErrorPanel message="Refresh the page and try again." />;
  }

  const canManageOffice = hasCapability(context, "offices:manage");
  const canManageRooms = hasCapability(context, "rooms:manage");
  const officeId = typeof searchParams.office === "string" ? searchParams.office : "";
  let office = null;
  let roomResult = { rows: [], total: 0 };
  let detailError = "";
  if (officeId) {
    try {
      office = await getOffice(context, officeId, { includeArchived: canManageOffice });
      roomResult = await listRooms(context, officeId, {
        q: searchParams.roomQ ?? "",
        page: searchParams.roomPage ?? 1,
        pageSize: 20,
        status: searchParams.roomStatus ?? "active",
        includeArchivedOffice: canManageOffice,
        pageSize: 50,
      });
    } catch (error) {
      detailError = error?.code === "NOT_FOUND"
        ? "The office is unavailable or you do not have access to it."
        : "Refresh the page and try again.";
    }
  }

  return <div className="om-workspace">
    <div className="om-directory-heading">
      <div><p className="om-eyebrow">LOCATIONS & SPACES</p><h2>Office directory</h2><p>Organize each location and the rooms assigned to it.</p></div>
      {office && <Link className="om-back-link" href="/dashboard?view=offices">← All offices</Link>}
    </div>

    {!office && !officeId && <>
      <div className="om-directory-toolbar">
        <form method="get" action="/dashboard" className="om-search-form">
          <input type="hidden" name="view" value="offices" />
          <label htmlFor="office-search">Search office name or code</label>
          <div><input id="office-search" name="q" defaultValue={searchParams.q ?? ""} maxLength={100} placeholder="Try “Manila”" />{canManageOffice && <label className="om-status-filter">Status <select name="status" defaultValue={searchParams.status ?? "active"}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></select></label>}<button type="submit">Search</button></div>
        </form>
        <span>{directory.total} {directory.total === 1 ? "location" : "locations"}</span>
      </div>
      {directory.rows.length ? <div className="om-office-list">
        {directory.rows.map((row) => <article className="om-office-card" key={row.id}>
          <div className="om-office-card-icon" aria-hidden="true">⌂</div>
          <div className="om-office-card-main">
            <Link href={officeHref(row.id, searchParams)} className="om-office-name">{row.name}</Link>
            <p>{row.code} <span>·</span> {row.timezone}{row.address ? ` · ${row.address}` : ""}</p>
          </div>
          <span className={`om-status ${row.isActive ? "is-active" : "is-archived"}`}>{row.isActive ? "Active" : "Archived"}</span>
          <Link className="om-open-link" href={officeHref(row.id, searchParams)} aria-label={`Manage ${row.name}`}>Manage <span aria-hidden="true">→</span></Link>
        </article>)}
      </div> : <div className="om-empty"><strong>{searchParams.q ? "No offices match that search" : "No offices yet"}</strong><p>{searchParams.q ? "Try another name or code." : "Add the first location to start organizing your workspace."}</p></div>}
      {directory.totalPages > 1 && <nav className="om-pagination" aria-label="Office pages">
        {directory.page > 1 && <Link href={`/dashboard?view=offices&page=${directory.page - 1}${searchParams.q ? `&q=${encodeURIComponent(searchParams.q)}` : ""}${searchParams.status ? `&status=${encodeURIComponent(searchParams.status)}` : ""}`}>Previous</Link>}
        <span>Page {directory.page} of {directory.totalPages}</span>
        {directory.page < directory.totalPages && <Link href={`/dashboard?view=offices&page=${directory.page + 1}${searchParams.q ? `&q=${encodeURIComponent(searchParams.q)}` : ""}${searchParams.status ? `&status=${encodeURIComponent(searchParams.status)}` : ""}`}>Next</Link>}
      </nav>}
      {canManageOffice && <section className="om-subpanel"><div className="om-subpanel-heading"><div><h3>Add an office</h3><p>Codes are unique within your organization.</p></div></div><OfficeForm /></section>}
    </>}

    {officeId && (office ? <>
      <section className="om-subpanel om-office-detail">
        <div className="om-subpanel-heading"><div><span className={`om-status ${office.isActive ? "is-active" : "is-archived"}`}>{office.isActive ? "Active location" : "Archived location"}</span><h3>{office.name}</h3><p>{office.code} · {office.timezone}{office.address ? ` · ${office.address}` : ""}</p></div></div>
        {canManageOffice && office.isActive && <>
          <OfficeForm key={`${office.id}-${office.updatedAt.toISOString()}`} office={office} />
          <div className="om-archive-row"><p>Archiving keeps this office’s history and removes it from active selectors.</p><ArchiveOfficeForm officeId={office.id} /></div>
        </>}
      </section>
      <section className="om-subpanel">
        <div className="om-subpanel-heading"><div><h3>Rooms</h3><p>{roomResult.total} {roomResult.total === 1 ? "room" : "rooms"} · capacity is optional and measured in people.</p></div></div>
        <div className="om-room-toolbar">
          <form method="get" action="/dashboard" className="om-search-form">
            <input type="hidden" name="view" value="offices" />
            <input type="hidden" name="office" value={office.id} />
            <label htmlFor="room-search">Search room name or code</label>
            <div><input id="room-search" name="roomQ" defaultValue={searchParams.roomQ ?? ""} maxLength={100} placeholder="Try “Boardroom”" /><label className="om-status-filter">Status <select name="roomStatus" defaultValue={searchParams.roomStatus ?? "active"}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></select></label><button type="submit">Search</button></div>
          </form>
        </div>
        {roomResult.rows.length ? <div className="om-room-list">{roomResult.rows.map((room) => <article className="om-room-card" key={room.id}>
          <div className="om-room-heading"><div><strong>{room.name}</strong><p>{room.code} <span>·</span> {room.capacity === null ? "Capacity not set" : `${room.capacity} people`}</p></div><span className={`om-status ${room.isActive ? "is-active" : "is-archived"}`}>{room.isActive ? "Active" : "Archived"}</span></div>
          {canManageRooms && office.isActive && room.isActive && <>
            <RoomForm key={`${room.id}-${room.updatedAt.toISOString()}`} officeId={office.id} room={room} />
            <div className="om-archive-row"><p>Room assignments must be moved before archiving.</p><ArchiveRoomForm officeId={office.id} roomId={room.id} /></div>
          </>}
        </article>)}</div> : <div className="om-empty"><strong>{searchParams.roomQ ? "No rooms match that search" : "No rooms in this office yet"}</strong><p>{searchParams.roomQ ? "Try another room name or code." : "Add rooms such as meeting spaces, work areas, and supply rooms."}</p></div>}
        {roomResult.totalPages > 1 && <nav className="om-pagination" aria-label="Room pages">
          {roomResult.page > 1 && <Link href={`/dashboard?view=offices&office=${office.id}&roomPage=${roomResult.page - 1}${searchParams.roomQ ? `&roomQ=${encodeURIComponent(searchParams.roomQ)}` : ""}${searchParams.roomStatus ? `&roomStatus=${encodeURIComponent(searchParams.roomStatus)}` : ""}`}>Previous</Link>}
          <span>Page {roomResult.page} of {roomResult.totalPages}</span>
          {roomResult.page < roomResult.totalPages && <Link href={`/dashboard?view=offices&office=${office.id}&roomPage=${roomResult.page + 1}${searchParams.roomQ ? `&roomQ=${encodeURIComponent(searchParams.roomQ)}` : ""}${searchParams.roomStatus ? `&roomStatus=${encodeURIComponent(searchParams.roomStatus)}` : ""}`}>Next</Link>}
        </nav>}
        {canManageRooms && office.isActive && <div className="om-create-room"><h4>Add a room</h4><RoomForm officeId={office.id} /></div>}
      </section>
    </> : <ErrorPanel message={detailError || "The office was not found."} />)}
  </div>;
}
