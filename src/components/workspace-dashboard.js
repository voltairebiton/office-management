"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { visibleNavigation, workspaceViews } from "@/lib/workspace-navigation";
import { WorkspaceIcon as Icon } from "@/components/workspace-icon";
import { WorkspaceSettingsForm } from "@/components/workspace-settings-form";

const emptyData = { offices: [], needs: [], items: [], movements: [], people: [] };
const descriptions = {
  overview: "A clear view of your spaces, people, and everyday essentials.",
  offices: "Your locations and the rooms that make them work.",
  people: "Office access and assigned rooms for your team.",
  inventory: "Supplies and furniture, tracked by quantity and location.",
  requirements: "What each room needs, what is deployed, and what is missing.",
  movements: "Follow supplies from receipt to their next location.",
  refreshments: "A little hospitality, delivered to the right desk.",
  visitors: "A welcoming arrival, from reception to the host.",
  settings: "Your workspace identity and access configuration.",
};

function MenuContent({ mobile = false, base, preview, view, href, closeMenu, initials, account, signOutAction, capabilities = [], organizationName }) {
  return <>
    <Link href={base} className="ws-brand" onClick={mobile ? closeMenu : undefined}>
      <span className="ws-logo"><Icon name="building" size={23} /></span>
      <span>Office<span className="ws-brand-sub">MANAGEMENT</span></span>
    </Link>
    <div className="ws-tenant"><span className="ws-tenant-avatar">{preview ? "S" : (organizationName?.trim()?.[0]?.toUpperCase() || "W")}</span><span><strong>{preview ? "Studio & Co." : organizationName || "Your workspace"}</strong><small>{preview ? "Design preview" : "Staff workspace"}</small></span></div>
    <nav aria-label={mobile ? "Mobile workspace navigation" : "Workspace navigation"} className="ws-nav">
      {visibleNavigation(capabilities, preview).map(group => <div className="ws-nav-group" key={group.label}>
        <p>{group.label}</p>
        {group.items.map(item => <Link key={item.id} href={href(item.id)} className={`ws-nav-link ${view === item.id ? "is-active" : ""}`} aria-current={view === item.id ? "page" : undefined} onClick={mobile ? closeMenu : undefined}>
          <Icon name={item.icon} size={18} /><span>{item.label}</span>{item.planned && <small>Later</small>}
        </Link>)}
      </div>)}
    </nav>
    <div className="ws-sidebar-note"><span className="ws-note-dot" /><span>Made for the everyday office.</span></div>
    <div className="ws-profile"><span className="ws-avatar">{initials}</span><span><strong>{account.name}</strong><small>{account.role.replaceAll("_", " ").replaceAll("-", " ")}</small></span></div>
    {preview ? <Link className="ws-signout" href="/auth/sign-in"><Icon name="logout" size={15} />Staff sign in</Link> : <form action={signOutAction}><button className="ws-signout" type="submit"><Icon name="logout" size={15} />Sign out</button></form>}
  </>;
}

function Empty({ icon = "box", title = "Your workspace starts here", children }) {
  return <div className="ws-empty"><span className="ws-empty-icon"><Icon name={icon} size={28} /></span><h3>{title}</h3><p>{children}</p></div>;
}

function Panel({ href, title, subtitle, link, children, className = "" }) {
  return <section className={`ws-panel ${className}`}><div className="ws-panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{link && <Link className="ws-inline-link" href={href(link)} aria-label={`View all ${title.toLowerCase()}`}>View all <Icon name="arrow" size={16} /></Link>}</div>{children}</section>;
}

function NeedsTable({ rows, data, preview }) {
  return rows.length ? <div className="ws-table-scroll"><table className="ws-table"><caption className="ws-sr-only">Room inventory requirements</caption><thead><tr><th>Room / item</th><th>Deployed</th><th>Target</th><th>Status</th></tr></thead><tbody>{rows.map(row => <tr key={`${row.office}-${row.room}-${row.item}`}><td><strong>{row.room}</strong><small>{row.item} · {row.officeName || data.offices.find(item => item.id === row.office)?.name}</small></td><td>{row.deployed}<small>{row.unit}</small></td><td>{row.target}</td><td>{row.deployed < row.target ? <span className="ws-status amber">Needs {row.target - row.deployed}</span> : <span className="ws-status green">On target</span>}</td></tr>)}</tbody></table></div> : <Empty icon="check" title={preview ? "No matching room requirements" : data.live ? "No rooms below their targets" : "Room requirements are next"}>{preview ? "Try another office or search term." : data.live ? "There are no active room stock targets below their deployed quantities in this view." : "Room targets and deployed quantities will appear here once the inventory workflow is connected."}</Empty>;
}

function OfficeList({ offices, live = false, canManage = false }) {
  return offices.length ? <div className="ws-office-list">{offices.map(row => <div className="ws-office-row" key={row.id}><span className="ws-office-icon"><Icon name="building" /></span><div><strong>{row.name}</strong><small>{row.location}</small></div><div className="ws-office-numbers"><strong>{row.rooms} rooms</strong><small>{row.people} assigned</small></div></div>)}</div> : <Empty icon="building" title={live ? "No active offices" : "Bring your offices together"}>{live ? canManage ? <>Add an office and its rooms in <Link href="/dashboard?view=offices">Offices & rooms</Link>.</> : "Ask a workspace administrator to grant access to an active office." : "Office and room management is the next implementation milestone."}</Empty>;
}

function Movements({ rows, preview, live = false }) {
  return rows.length ? <div className="ws-activity">{rows.map((row, index) => <div className="ws-activity-row" key={row.transactionId || `${row.office}-${row.item}-${index}`}><span className={`ws-activity-icon ${row.kind === "Receipt" ? "received" : ""}`}><Icon name={row.kind === "Receipt" ? "box" : "transfer"} size={18} /></span><div><strong>{row.quantity} {row.item.toLowerCase()} {row.unit || ""}</strong><small>{row.officeName ? `${row.officeName} · ` : ""}{row.from} <span aria-hidden="true">→</span> {row.to}</small></div><div className="ws-activity-time"><span>{row.kind}</span><small>{row.time}</small></div></div>)}</div> : <Empty icon="transfer" title={preview ? "No matching movements" : live ? "No stock movements yet" : "A record of every movement"}>{preview ? "Try another office or search term." : live ? "Receipts, transfers, and stock adjustments will appear here when recorded." : "Receipts and room deployments will appear here when stock movements are implemented."}</Empty>;
}


export function WorkspaceDashboard({ view = "overview", preview = false, data = emptyData, account, signOutAction, organizationName = "", capabilities = [], accessDenied = false, officeContent = null, peopleContent = null, inventoryContent = null, requirementContent = null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlOffice = searchParams.get("office") || "all";
  const urlQuery = searchParams.get("q") || "";
  const [search, setSearch] = useState({ view, query: urlQuery, urlQuery });
  const query = search.view === view && search.urlQuery === urlQuery ? search.query : urlQuery;
  const mobileMenu = useRef(null);
  const menuTrigger = useRef(null);
  const base = preview ? "/preview" : "/dashboard";
  const officeFilter = urlOffice === "all" || data.offices.some((row) => row.id === urlOffice) ? urlOffice : "all";
  const href = (id) => {
    const params = new URLSearchParams();
    if (id !== "overview") params.set("view", id);
    if (officeFilter !== "all") params.set("office", officeFilter);
    return params.size ? `${base}?${params.toString()}` : base;
  };
  const scoped = (rows) => rows.filter(row => officeFilter === "all" || row.office === officeFilter);
  const matching = (rows) => rows.filter(row => Object.values(row).join(" ").toLowerCase().includes(query.toLowerCase()));
  const offices = data.offices.filter(row => officeFilter === "all" || row.id === officeFilter);
  const needs = scoped(data.needs);
  const shortages = needs.filter(row => row.deployed < row.target);
  const selectedOffice = data.offices.find(row => row.id === officeFilter);
  const current = workspaceViews[view];
  const initials = account.name.split(" ").slice(0, 2).map(word => word[0]).join("");
  function closeMenu() { mobileMenu.current?.close(); menuTrigger.current?.focus(); }

  const officeScopedValue = (globalValue, officeValue) => officeFilter === "all" ? globalValue : officeValue;
  const overview = data.error ? <div className="ws-foundation-notice" role="alert"><Icon name="alert" size={21} /><div><strong>We couldn’t load your workspace overview.</strong><p>Refresh the page to try again. No sample data has been substituted.{data.errorRequestId ? ` Reference: ${data.errorRequestId}.` : ""}</p></div></div> : <>
    <div className="ws-stats">
      {[
        { label: "Office locations", value: officeScopedValue(data.officeCount ?? offices.length, 1), note: "Active offices in your access", icon: "building" },
        { label: "Rooms", value: officeScopedValue(data.roomCount ?? offices.reduce((sum, row) => sum + row.rooms, 0), selectedOffice ? data.roomCountsByOffice?.[officeFilter] ?? selectedOffice.rooms : 0), note: "Active rooms", icon: "overview" },
        { label: "Assigned employees", value: officeScopedValue(data.assignedEmployeeCount ?? offices.reduce((sum, row) => sum + row.people, 0), selectedOffice ? data.peopleCountsByOffice?.[officeFilter] ?? selectedOffice.people : 0), note: "Active room assignments · not attendance", icon: "people" },
        { label: "Rooms needing supplies", value: officeScopedValue(data.roomsNeedingSupplies ?? new Set(shortages.map(row => `${row.office}-${row.room}`)).size, selectedOffice ? data.roomNeedsByOffice?.[officeFilter] ?? new Set(shortages.filter(row => row.office === officeFilter).map(row => row.room)).size : 0), note: "Below their inventory targets", icon: "alert", warning: true },
      ].map(stat => <div className={`ws-stat ${stat.warning ? "ws-stat-warning" : ""}`} key={stat.label}><div><span>{stat.label}</span><Icon name={stat.icon} size={19} /></div><strong>{preview || data.live ? Number(stat.value).toString().padStart(2, "0") : "—"}</strong><small>{preview || data.live ? stat.note : "Awaiting workspace setup"}</small></div>)}
    </div>
    <div className="ws-content-grid">
      <Panel href={href} title="Rooms needing attention" subtitle="Keep everyday essentials within reach." link="requirements"><NeedsTable data={data} preview={preview} rows={shortages} />{preview && <div className="ws-panel-foot"><span className="ws-small-dot amber" />{shortages.reduce((sum, row) => sum + row.target - row.deployed, 0)} units needed across {shortages.length} room requirements</div>}</Panel>
      <Panel href={href} title="Your offices" subtitle={`${offices.length} active locations in this view`} link="offices"><OfficeList offices={offices} live={data.live} canManage={capabilities.includes("offices:manage")} /></Panel>
      <Panel href={href} title="Recent stock movements" subtitle={preview ? "Sample activity · not live records" : "The journey of your office supplies"} link="movements"><Movements preview={preview} live={data.live} rows={scoped(data.movements)} /></Panel>
      <section className="ws-service-card"><span className="ws-service-tag">A little further ahead</span><div className="ws-service-art" aria-hidden="true"><Icon name="coffee" size={60} /><span className="ws-art-square" /><span className="ws-art-dot" /></div><h2>Hospitality, without<br />the back and forth.</h2><p>Desk and visitor QR ordering, with a dedicated queue for office helpers.</p><Link href={href("refreshments")}>Explore what’s planned <Icon name="arrow" size={17} /></Link></section>
    </div>
  </>;

  const searchable = (preview && ["people", "inventory", "requirements", "movements"].includes(view)) || (data.live && view === "movements" && !data.error);
  function changeOffice(value) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("office");
    else params.set("office", value);
    const suffix = params.toString();
    router.push(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  }
  function changeSearch(value) {
    setSearch({ view, query: value, urlQuery });
    if (view !== "movements" || !data.live) return;
    const params = new URLSearchParams(searchParams.toString());
    if (value.trim()) params.set("q", value);
    else params.delete("q");
    const suffix = params.toString();
    window.history.replaceState(null, "", suffix ? `${pathname}?${suffix}` : pathname);
  }
  return <div className="ws-app">
    <a className="ws-skip" href="#workspace-main">Skip to main content</a>
    <aside className="ws-sidebar"><MenuContent base={base} preview={preview} view={view} href={href} closeMenu={closeMenu} initials={initials} account={account} signOutAction={signOutAction} capabilities={capabilities} organizationName={organizationName} /></aside>
    <dialog ref={mobileMenu} className="ws-mobile-dialog" onCancel={() => menuTrigger.current?.focus()}><button className="ws-mobile-close" aria-label="Close navigation" onClick={closeMenu}><Icon name="close" /></button><MenuContent base={base} preview={preview} view={view} href={href} closeMenu={closeMenu} initials={initials} account={account} signOutAction={signOutAction} capabilities={capabilities} organizationName={organizationName} mobile /></dialog>
    <div className="ws-body">
      <header className="ws-topbar"><div className="ws-breadcrumb"><button ref={menuTrigger} className="ws-menu-button" aria-label="Open navigation" onClick={() => mobileMenu.current?.showModal()}><Icon name="menu" /></button><span>Workspace</span><Icon name="chevron" size={13} /><strong>{current.label}</strong></div><div className="ws-topbar-right">{(preview || (data.live && !data.error && ["overview", "movements"].includes(view))) && <label className="ws-office-filter"><Icon name="building" size={16} /><span className="ws-sr-only">Filter by office</span><select value={officeFilter} onChange={event => changeOffice(event.target.value)} disabled={!preview && !["overview", "movements"].includes(view)}><option value="all">All offices</option>{data.offices.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}<span className="ws-top-avatar" title={account.name}>{initials}</span></div></header>
      {preview && <div className="ws-preview-banner"><span><strong>Design preview</strong><span className="ws-banner-divider">/</span>Fictional sample data. Changes are not saved.</span><Link href="/dashboard">Open staff workspace <Icon name="arrow" size={14} /></Link></div>}
      <main id="workspace-main" className="ws-main" tabIndex={-1}>
        <div className="ws-page-heading"><div><p className="ws-kicker">{view === "overview" ? "THE EVERYDAY, ORGANIZED" : "YOUR OFFICE WORKSPACE"}</p><h1>{view === "overview" ? "Workspace overview" : current.label}</h1><p>{descriptions[view]}</p></div><span className="ws-context"><span className="ws-small-dot" />{preview ? selectedOffice?.name || "All locations" : selectedOffice?.name || organizationName || "Your workspace"}</span></div>
        {searchable && <div className="ws-toolbar"><label className="ws-search"><Icon name="search" size={18} /><input type="search" placeholder={`Search ${current.label.toLowerCase()}…`} aria-label={`Search ${current.label.toLowerCase()}`} value={query} onChange={event => changeSearch(event.target.value)} /></label><span>{preview ? "Sample records" : "Recent live records"}</span></div>}
        {accessDenied ? <div className="ws-foundation-notice" role="alert"><Icon name="alert" size={21} /><div><strong>This section isn’t available for your account.</strong><p>Ask a workspace administrator if you need access.</p></div></div> : view === "overview" && overview}
        {view === "offices" && !accessDenied && (officeContent ?? <Panel href={href} title="Office directory" subtitle="Rooms and assigned employees by location"><OfficeList offices={offices} live={data.live} canManage={capabilities.includes("offices:manage")} /></Panel>)}
        {view === "requirements" && !accessDenied && (requirementContent ?? <Panel href={href} title="Room inventory requirements" subtitle="Quantity targets and deployment gaps"><NeedsTable data={data} preview={preview} rows={matching(needs)} /></Panel>)}
        {view === "movements" && !accessDenied && (data.error ? <div className="ws-foundation-notice" role="alert"><Icon name="alert" size={21} /><div><strong>We couldn’t load stock movements.</strong><p>Refresh the page to try again. No sample data has been substituted.{data.errorRequestId ? ` Reference: ${data.errorRequestId}.` : ""}</p></div></div> : <Panel href={href} title="Movement history" subtitle="Receipts, transfers, and room deployments"><Movements preview={preview} live={data.live} rows={matching(scoped(data.movements))} /></Panel>)}
        {view === "people" && !accessDenied && (peopleContent ?? <Panel href={href} title="People & room assignments" subtitle="Assigned headcounts only. Attendance is a future feature.">{matching(scoped(data.people)).length ? <div className="ws-table-scroll"><table className="ws-table"><caption className="ws-sr-only">Sample employee room assignments</caption><thead><tr><th>Team member</th><th>Role</th><th>Assigned room</th><th>Office</th></tr></thead><tbody>{matching(scoped(data.people)).map(row => <tr key={row.name}><td><strong>{row.name}</strong></td><td>{row.role}</td><td>{row.room}</td><td>{data.offices.find(item => item.id === row.office)?.name}</td></tr>)}</tbody></table></div> : <Empty icon={current.icon} title="No matching people">Try another office or search term.</Empty>}</Panel>)}
        {view === "inventory" && !accessDenied && (inventoryContent ?? <Panel href={href} title="Supplies & furniture" subtitle="Available storeroom quantities, separate from deployed room stock">{matching(scoped(data.items)).length ? <div className="ws-table-scroll"><table className="ws-table"><caption className="ws-sr-only">Sample available office stock</caption><thead><tr><th>Item</th><th>Category</th><th>Office</th><th>Available stock</th></tr></thead><tbody>{matching(scoped(data.items)).map(row => <tr key={`${row.office}-${row.name}`}><td><strong>{row.name}</strong></td><td>{row.category}</td><td>{data.offices.find(item => item.id === row.office)?.name}</td><td><strong>{row.stock}</strong><small>{row.unit}</small></td></tr>)}</tbody></table></div> : <Empty icon={current.icon} title="No matching stock">Try another office or search term.</Empty>}</Panel>)}
        {current.planned && <section className="ws-planned"><span className="ws-planned-icon"><Icon name={current.icon} size={42} /></span><span className="ws-status amber">Planned feature</span><h2>{view === "refreshments" ? "Scan. Order. Back to your day." : "A warm welcome starts here."}</h2><p>{view === "refreshments" ? "Selected desks and waiting visitors will order using their QR codes. Office helpers will receive notifications and manage preparation and delivery." : "Reception will register arrivals, connect visitors with their hosts, and issue visit QR codes for refreshments while they wait."}</p><div className="ws-planned-steps">{(view === "refreshments" ? ["Desk & visitor QR codes", "Refreshment menu", "Helper fulfillment queue"] : ["Visitor registration", "Host & arrival tracking", "Visit-linked refreshment QR"]).map((text, index) => <div key={text}><span>0{index + 1}</span>{text}</div>)}</div><p className="ws-planned-note">This workflow is not implemented yet.</p></section>}
        {view === "settings" && !accessDenied && <Panel href={href} title="Workspace settings" subtitle="Verified workspace identity and staff access."><dl className="ws-settings"><div><dt>Workspace</dt><dd>{preview ? "Studio & Co. (sample)" : organizationName}</dd></div><div><dt>Signed in as</dt><dd>{account.name}</dd></div><div><dt>Account</dt><dd>{account.email}</dd></div><div><dt>Workspace role</dt><dd>{account.role.replaceAll("_", " ").replaceAll("-", " ")}</dd></div><div><dt>Authentication</dt><dd>{preview ? "Fictional design preview" : "Verified by WorkOS"}</dd></div><div><dt>Application scope</dt><dd>Multiple offices, assigned rooms, quantity-based inventory</dd></div></dl>{!preview && <WorkspaceSettingsForm organizationName={organizationName} canManage={capabilities.includes("tenant:manage")} />}</Panel>}
        <footer className="ws-footer"><span>Office Management<span className="ws-footer-dot">·</span>A place for everything.</span><span>{preview ? "Preview workspace" : "Staff workspace"}</span></footer>
      </main>
    </div>
  </div>;
}
