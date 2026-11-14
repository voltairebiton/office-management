import Link from "next/link";
import {
  OfficeAccessGrantForm,
  OfficeAccessRevokeForm,
  RoomAssignmentForm,
} from "@/components/people-forms";
import { hasCapability } from "@/lib/authorization";
import { listOffices, listRooms } from "@/lib/office-service";
import {
  getRoomAssignmentCounts,
  listMemberOfficeAccess,
  listMembers,
  listOfficeRoster,
  listOwnAssignments,
} from "@/lib/people-service";

const pageSize = 20;

function dashboardUrl(params = {}) {
  const query = new URLSearchParams({ view: "people" });
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  return `/dashboard?${query.toString()}`;
}

function ErrorPanel({ message = "Refresh the page and try again." }) {
  return <div className="om-empty" role="alert"><strong>We couldn’t load this people view.</strong><p>{message}</p></div>;
}

function EmptyPanel({ title, message }) {
  return <div className="om-empty"><strong>{title}</strong><p>{message}</p></div>;
}

function Pagination({ result, params, label }) {
  if (result.totalPages < 2) return null;
  return <nav className="om-pagination" aria-label={`${label} pages`}>
    {result.page > 1 && <Link href={dashboardUrl({ ...params, page: result.page - 1 })}>Previous</Link>}
    <span>Page {result.page} of {result.totalPages}</span>
    {result.page < result.totalPages && <Link href={dashboardUrl({ ...params, page: result.page + 1 })}>Next</Link>}
  </nav>;
}

async function AdminPeopleWorkspace({ context, searchParams }) {
  const status = searchParams.status ?? "active";
  const q = searchParams.q ?? "";
  const page = searchParams.page ?? 1;
  let members;
  let offices;
  let accessRows;
  try {
    [members, offices] = await Promise.all([
      listMembers(context, { q, status, page, pageSize }),
      listOffices(context, { status: "active", page: 1, pageSize: 50 }),
    ]);
    accessRows = await listMemberOfficeAccess(context, members.rows.map((member) => member.id));
  } catch {
    return <ErrorPanel />;
  }

  const accessByMember = new Map();
  for (const access of accessRows) {
    if (!accessByMember.has(access.membershipId)) accessByMember.set(access.membershipId, []);
    accessByMember.get(access.membershipId).push(access);
  }
  return <div className="pm-workspace">
    <div className="om-directory-heading">
      <div><p className="om-eyebrow">TEAM & ACCESS</p><h2>Member directory</h2><p>WorkOS managed identities with office access controlled by organization administrators.</p></div>
    </div>
    <div className="om-directory-toolbar">
      <form method="get" action="/dashboard" className="om-search-form">
        <input type="hidden" name="view" value="people" />
        <label htmlFor="people-search">Search name or email</label>
        <div><input id="people-search" name="q" defaultValue={typeof q === "string" ? q : ""} maxLength={100} placeholder="Search your team" />
          <label className="om-status-filter">Status <select name="status" defaultValue={status}><option value="active">Active</option><option value="pending">Pending</option><option value="inactive">Inactive</option><option value="all">All</option></select></label>
          <button type="submit">Search</button>
        </div>
      </form>
      <span>{members.total} {members.total === 1 ? "member" : "members"}</span>
    </div>
    {members.rows.length ? <div className="pm-member-list">
      {members.rows.map((member) => {
        const activeAccess = accessByMember.get(member.id) ?? [];
        const assignedOfficeIds = new Set(activeAccess.map((access) => access.officeId));
        const availableOffices = offices.rows.filter((office) => !assignedOfficeIds.has(office.id));
        return <article className="pm-member-card" key={member.id}>
          <div className="pm-member-heading">
            <div><h3>{member.displayName || "Name not provided"}</h3><p>{member.email}</p></div>
            <div className="pm-member-meta"><span className={`om-status ${member.status === "active" ? "is-active" : "is-archived"}`}>{member.status}</span><span>{member.role.replaceAll("_", " ")}</span></div>
          </div>
          <div className="pm-access-section">
            <h4>Office access</h4>
            {activeAccess.length ? <div className="pm-access-list">{activeAccess.map((access) => <OfficeAccessRevokeForm key={access.officeId} membershipId={member.id} officeId={access.officeId} officeName={access.officeName} />)}</div> : <p className="pm-muted">No active office access.</p>}
            {member.status === "active" && availableOffices.length > 0 && <OfficeAccessGrantForm membershipId={member.id} offices={availableOffices} />}
            {member.status === "active" && offices.total > offices.rows.length && <p className="pm-muted">Showing the first {offices.rows.length} active offices in the grant selector.</p>}
          </div>
        </article>;
      })}
    </div> : <EmptyPanel title={q ? "No members match that search" : "No members in this view"} message={q ? "Try another name or email address." : "Active WorkOS organization members will appear here."} />}
    <Pagination result={members} params={{ q, status }} label="Member directory" />
  </div>;
}

async function ManagerPeopleWorkspace({ context, searchParams }) {
  const q = searchParams.q ?? "";
  const page = searchParams.page ?? 1;
  let offices;
  try {
    offices = await listOffices(context, { status: "active", page: 1, pageSize: 50 });
  } catch {
    return <ErrorPanel message="Your office assignment is unavailable." />;
  }
  const officeId = typeof searchParams.office === "string" ? searchParams.office : offices.rows[0]?.id;
  if (!officeId) return <EmptyPanel title="No assigned offices" message="An organization administrator must grant office access before you can manage room assignments." />;

  let roster;
  let rooms;
  let counts;
  try {
    [roster, rooms, counts] = await Promise.all([
      listOfficeRoster(context, officeId, { q, page, pageSize }),
      listRooms(context, officeId, { status: "active", page: 1, pageSize: 50 }),
      getRoomAssignmentCounts(context, officeId),
    ]);
  } catch (error) {
    return <ErrorPanel message={error?.code === "NOT_FOUND" ? "This office is unavailable or outside your active office access." : undefined} />;
  }
  const selectedOffice = offices.rows.find((office) => office.id === officeId);
  const filterParams = { office: officeId, q };
  return <div className="pm-workspace">
    <div className="om-directory-heading">
      <div><p className="om-eyebrow">TEAM & ROOM ASSIGNMENTS</p><h2>{selectedOffice?.name ?? "Office roster"}</h2><p>Assign active office members to a room. Capacity is advisory; these counts describe assignments, not attendance.</p></div>
    </div>
    <div className="pm-office-picker">
      <form method="get" action="/dashboard">
        <input type="hidden" name="view" value="people" />
        <label htmlFor="people-office">Office</label>
        <select id="people-office" name="office" defaultValue={officeId}>
          {offices.rows.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
        </select>
        <button type="submit">Open office</button>
      </form>
      {offices.total > offices.rows.length && <span>Showing the first {offices.rows.length} offices assigned to your account.</span>}
    </div>
    <div className="om-directory-toolbar">
      <form method="get" action="/dashboard" className="om-search-form">
        <input type="hidden" name="view" value="people" /><input type="hidden" name="office" value={officeId} />
        <label htmlFor="roster-search">Search active office members</label>
        <div><input id="roster-search" name="q" defaultValue={typeof q === "string" ? q : ""} maxLength={100} placeholder="Search name or email" /><button type="submit">Search</button></div>
      </form>
      <span>{roster.total} {roster.total === 1 ? "member" : "members"} · {rooms.total} {rooms.total === 1 ? "room" : "rooms"}</span>
    </div>
    {roster.rows.length ? <div className="pm-member-list">
      {roster.rows.map((member) => <article className="pm-member-card" key={member.membershipId}>
        <div className="pm-member-heading">
          <div><h3>{member.displayName || "Name not provided"}</h3><p>{member.email}</p></div>
          <div className="pm-member-meta"><span>{member.role.replaceAll("_", " ")}</span>{member.roomName && <span className="om-status is-active">{member.roomName}</span>}</div>
        </div>
        {rooms.rows.length ? <RoomAssignmentForm officeId={officeId} member={member} rooms={rooms.rows} counts={counts} /> : <p className="pm-muted">Add an active room in Offices & rooms before assigning this member.</p>}
      </article>)}
    </div> : <EmptyPanel title={q ? "No members match that search" : "No active members have office access"} message={q ? "Try another name or email address." : "An administrator can grant office access from the People directory."} />}
    <Pagination result={roster} params={filterParams} label="Office roster" />
  </div>;
}

async function OwnAssignments({ context }) {
  let assignments;
  try {
    assignments = await listOwnAssignments(context);
  } catch {
    return <ErrorPanel />;
  }
  return <div className="pm-workspace">
    <div className="om-directory-heading"><div><p className="om-eyebrow">YOUR WORKSPACE</p><h2>Your room assignments</h2><p>Only your own assigned rooms are shown here. Attendance is not tracked.</p></div></div>
    {assignments.length ? <div className="pm-member-list">{assignments.map((assignment) => <article className="pm-member-card pm-own-assignment" key={assignment.id}>
      <span className="om-office-card-icon" aria-hidden="true">⌂</span><div><h3>{assignment.roomName}</h3><p>{assignment.officeName} · {assignment.roomCode}</p></div>
    </article>)}</div> : <EmptyPanel title="No active room assignment" message="Your assigned room will appear here when your office manager sets it up." />}
  </div>;
}

export async function PeopleWorkspace({ context, searchParams = {} }) {
  if (hasCapability(context, "members:read")) {
    return <AdminPeopleWorkspace context={context} searchParams={searchParams} />;
  }
  if (hasCapability(context, "assignments:manage")) {
    return <ManagerPeopleWorkspace context={context} searchParams={searchParams} />;
  }
  if (hasCapability(context, "assignments:read:self")) {
    return <OwnAssignments context={context} />;
  }
  return <ErrorPanel message="Your current workspace role does not include access to people or room assignments." />;
}
