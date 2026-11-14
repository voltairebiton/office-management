import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  ArchiveCatalogItemForm,
  ArchiveStockLocationForm,
  CatalogItemForm,
  EnsureRoomLocationForm,
  ReceiveStockForm,
  StorageLocationForm,
  StockAdjustmentForm,
  TransferStockForm,
} from "@/components/catalog-forms";
import { hasCapability } from "@/lib/authorization";
import { getOffice, listOffices, listRooms } from "@/lib/office-service";
import { listCatalogItems, listStockLocations } from "@/lib/catalog-service";
import { listStockBalances, listStockMovements } from "@/lib/stock-service";

function workspaceUrl(values = {}) {
  const query = new URLSearchParams({ view: "inventory" });
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  }
  return `/dashboard?${query.toString()}`;
}

function ErrorPanel({ message = "Refresh the page and try again." }) {
  return <div className="om-empty" role="alert"><strong>We couldn’t load this inventory setup.</strong><p>{message}</p></div>;
}

function EmptyPanel({ title, message }) {
  return <div className="om-empty"><strong>{title}</strong><p>{message}</p></div>;
}

function StockBalances({ result, officeId }) {
  return <>
    {result.rows.length ? <div className="pm-stock-table-wrap"><table className="pm-stock-table">
      <caption className="ws-sr-only">Stock balances by item and location</caption>
      <thead><tr><th>Item</th><th>Location</th><th>On hand</th><th>Type</th></tr></thead>
      <tbody>{result.rows.map((row) => <tr key={row.id}>
        <td><strong>{row.itemName}</strong><small>{row.itemSku} · {row.itemCategory}</small></td>
        <td>{row.locationKind === "room" ? row.roomName ?? row.locationName : row.locationName}<small>{row.locationCode}</small></td>
        <td><strong>{row.quantity}</strong><small>{row.unit}</small></td>
        <td>{row.locationKind === "room" ? "Room" : "Storage"}</td>
      </tr>)}</tbody>
    </table></div> : <EmptyPanel title="No stock on hand yet" message="Record an opening receipt or replenish an office storeroom to establish the first balance." />}
    <Pagination result={result} query={{ office: officeId }} pageKey="balancePage" label="Stock balances" />
  </>;
}

function StockMovements({ result, officeId, timezone = "UTC" }) {
  const formatDate = (value) => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(value);
  return <>
    {result.rows.length ? <div className="pm-stock-table-wrap"><table className="pm-stock-table">
      <caption className="ws-sr-only">Recent stock movements</caption>
      <thead><tr><th>When</th><th>Movement</th><th>Item / location</th><th>Change</th><th>Reason / reference</th></tr></thead>
      <tbody>{result.rows.map((row) => <tr key={row.id}>
        <td>{formatDate(row.createdAt)}</td>
        <td>{row.movementType.replaceAll("_", " ")}<small>Movement ID: <code>{row.id}</code></small>{row.reversalOfMovementId && <small>Reverses: <code>{row.reversalOfMovementId}</code></small>}</td>
        <td><strong>{row.itemName}</strong><small>{row.itemSku} · {row.locationCode}</small></td>
        <td className={row.quantityDelta > 0 ? "pm-stock-positive" : "pm-stock-negative"}>{row.quantityDelta > 0 ? "+" : ""}{row.quantityDelta} {row.itemUnit}<small>Balance {row.balanceAfter}</small></td>
        <td>{row.reason}{row.reference && <small>{row.reference}</small>}</td>
      </tr>)}</tbody>
    </table></div> : <EmptyPanel title="No stock movements yet" message="Every receipt, deployment, return, and correction will leave a permanent record here." />}
    <Pagination result={result} query={{ office: officeId }} pageKey="movementPage" label="Stock movements" />
  </>;
}

function Pagination({ result, query, label, pageKey = "page" }) {
  if (result.totalPages < 2) return null;
  return <nav className="om-pagination" aria-label={`${label} pages`}>
    {result.page > 1 && <Link href={workspaceUrl({ ...query, [pageKey]: result.page - 1 })}>Previous</Link>}
    <span>Page {result.page} of {result.totalPages}</span>
    {result.page < result.totalPages && <Link href={workspaceUrl({ ...query, [pageKey]: result.page + 1 })}>Next</Link>}
  </nav>;
}

function ItemList({ result, canManage, query }) {
  return <>
    <div className="om-directory-toolbar">
      <form method="get" action="/dashboard" className="om-search-form">
        <input type="hidden" name="view" value="inventory" />
        <label htmlFor="catalog-search">Search item name or SKU</label>
        <div><input id="catalog-search" name="itemQ" defaultValue={query.itemQ ?? ""} maxLength={100} placeholder="Try “tissues” or “CHAIR-01”" />
          {canManage && <label className="om-status-filter">Status <select name="itemStatus" defaultValue={query.itemStatus ?? "active"}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></select></label>}
          <button type="submit">Search</button>
        </div>
      </form>
      <span>{result.total} {result.total === 1 ? "item" : "items"}</span>
    </div>
    {result.rows.length ? <div className="pm-catalog-list">
      {result.rows.map((item) => <article className="pm-catalog-card" key={item.id}>
        <div className="pm-catalog-card-heading"><div><h3>{item.name}</h3><p>{item.sku} · {item.category} · per {item.unit}</p></div><span className={`om-status ${item.isActive ? "is-active" : "is-archived"}`}>{item.isActive ? "Active" : "Archived"}</span></div>
        {canManage && item.isActive && <CatalogItemForm key={`${item.id}-${item.updatedAt.toISOString()}`} item={item} />}
        {canManage && item.isActive && <div className="pm-catalog-actions"><ArchiveCatalogItemForm itemId={item.id} name={item.name} /></div>}
      </article>)}
    </div> : <EmptyPanel title={query.itemQ ? "No items match that search" : "No catalog items yet"} message={query.itemQ ? "Try another item name or SKU." : "Add common supplies and reusable furniture to make them available across your offices."} />}
    <Pagination result={result} query={{ itemQ: query.itemQ, itemStatus: query.itemStatus }} pageKey="itemPage" label="Catalog" />
  </>;
}

function LocationList({ officeId, result, canManage, query }) {
  return <>
    <div className="om-directory-toolbar">
      <form method="get" action="/dashboard" className="om-search-form">
        <input type="hidden" name="view" value="inventory" /><input type="hidden" name="office" value={officeId} />
        <label htmlFor="location-search">Search location name or code</label>
        <div><input id="location-search" name="locQ" defaultValue={query.locQ ?? ""} maxLength={100} placeholder="Search storerooms, pantries, rooms" />
          <label className="om-status-filter">Status <select name="locStatus" defaultValue={query.locStatus ?? "active"}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></select></label>
          <button type="submit">Search</button>
        </div>
      </form>
      <span>{result.total} {result.total === 1 ? "location" : "locations"}</span>
    </div>
    {result.rows.length ? <div className="pm-catalog-list">
      {result.rows.map((location) => {
        const label = location.kind === "room" ? location.roomName ?? location.name : location.name;
        return <article className="pm-catalog-card" key={location.id}>
          <div className="pm-catalog-card-heading"><div><h3>{label}</h3><p>{location.code} · {location.kind === "room" ? "Room stock" : "Storage"}</p></div><span className={`om-status ${location.isActive ? "is-active" : "is-archived"}`}>{location.isActive ? "Active" : "Archived"}</span></div>
          {location.kind === "storage" && canManage && location.isActive && <StorageLocationForm key={`${location.id}-${location.updatedAt.toISOString()}`} officeId={officeId} location={location} />}
          {canManage && location.isActive && <div className="pm-catalog-actions"><ArchiveStockLocationForm officeId={officeId} locationId={location.id} name={label} /></div>}
        </article>;
      })}
    </div> : <EmptyPanel title={query.locQ ? "No locations match that search" : "No stock locations yet"} message={query.locQ ? "Try another location name or code." : "Create a storeroom or pantry, then set up a stock location for each room."} />}
    <Pagination result={result} query={{ office: officeId, locQ: query.locQ, locStatus: query.locStatus }} pageKey="locPage" label="Stock locations" />
  </>;
}

export async function CatalogWorkspace({ context, searchParams = {} }) {
  if (!hasCapability(context, "inventory:read")) {
    return <ErrorPanel message="Your current workspace role does not include access to the inventory catalog." />;
  }
  const canManageCatalog = hasCapability(context, "catalog:manage");
  const canManageLocations = hasCapability(context, "inventory:manage");
  const itemStatus = canManageCatalog ? searchParams.itemStatus ?? "active" : "active";
  const itemQuery = { itemQ: searchParams.itemQ ?? "", itemStatus, itemPage: searchParams.itemPage ?? 1 };
  let items;
  let offices;
  try {
    [items, offices] = await Promise.all([
      listCatalogItems(context, { q: itemQuery.itemQ, status: itemStatus, page: itemQuery.itemPage, pageSize: 20 }),
      listOffices(context, { status: "active", page: 1, pageSize: 50 }),
    ]);
  } catch {
    return <ErrorPanel />;
  }

  const requestedOfficeId = typeof searchParams.office === "string" ? searchParams.office : "";
  const officeId = requestedOfficeId || offices.rows[0]?.id || "";
  let office = offices.rows.find((row) => row.id === officeId) ?? null;
  if (officeId && !office) {
    try {
      office = await getOffice(context, officeId);
    } catch {
      return <ErrorPanel message="This office is unavailable or outside your active office access." />;
    }
  }

  let locations = { rows: [], total: 0, page: 1, totalPages: 0 };
  let roomLocations = { rows: [] };
  let rooms = { rows: [], total: 0 };
  let balances = { rows: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
  let adjustmentBalances = { rows: [], total: 0 };
  let movements = { rows: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
  let receiptItems = { rows: [], total: 0 };
  let receiptLocations = { rows: [], total: 0 };
  let transferLocations = { rows: [], total: 0 };
  if (officeId) {
    try {
      [locations, rooms, balances, adjustmentBalances, movements, receiptItems, receiptLocations, transferLocations] = await Promise.all([
        listStockLocations(context, officeId, {
          q: searchParams.locQ ?? "",
          status: searchParams.locStatus ?? "active",
          page: searchParams.locPage ?? 1,
          pageSize: 20,
        }),
        listRooms(context, officeId, { status: "active", page: 1, pageSize: 50 }),
        listStockBalances(context, officeId, { page: searchParams.balancePage ?? 1, pageSize: 20 }),
        listStockBalances(context, officeId, { page: searchParams.adjustmentPage ?? 1, pageSize: 50 }),
        listStockMovements(context, officeId, { page: searchParams.movementPage ?? 1, pageSize: 20 }),
        listCatalogItems(context, { status: "active", page: 1, pageSize: 50 }),
        listStockLocations(context, officeId, { status: "active", kind: "storage", page: 1, pageSize: 50 }),
        listStockLocations(context, officeId, { status: "active", page: 1, pageSize: 50 }),
      ]);
      roomLocations = await listStockLocations(context, officeId, {
        status: "all",
        kind: "room",
        roomIds: rooms.rows.map((room) => room.id),
        page: 1,
        pageSize: 50,
      });
    } catch {
      return <ErrorPanel />;
    }
  }

  const activeRoomLocationIds = new Set(roomLocations.rows.filter((location) => location.isActive).map((location) => location.roomId));
  const untrackedRooms = rooms.rows.filter((room) => !activeRoomLocationIds.has(room.id));
  return <div className="pm-workspace">
    <div className="om-directory-heading">
      <div><p className="om-eyebrow">CATALOG & STORAGE</p><h2>Inventory setup</h2><p>Maintain shared item definitions and prepare the locations where office stock will live.</p></div>
    </div>
    {!canManageCatalog && <div className="ws-foundation-notice pm-info-notice"><div><strong>Shared catalog</strong><p>You can select active tenant items for your assigned offices. Only organization administrators can change the shared item definitions.</p></div></div>}

    {office && <section className="om-subpanel">
      <div className="om-subpanel-heading"><div><h3>Receive stock</h3><p>Record opening stock or replenishment into an active storeroom or pantry. Receipts are saved once and added to the permanent movement history.</p></div></div>
      {canManageLocations ? <ReceiveStockForm key={officeId} officeId={officeId} locations={receiptLocations.rows} items={receiptItems.rows} initialRequestKey={randomUUID()} />
        : <EmptyPanel title="Receipt access required" message="Your role can view stock but cannot record receipts." />}
      {(receiptItems.total > receiptItems.rows.length || receiptLocations.total > receiptLocations.rows.length) && <p className="pm-muted pm-selector-note">The receipt selectors show the first 50 active items and storage locations.</p>}
    </section>}

    {office && <section className="om-subpanel">
      <div className="om-subpanel-heading"><div><h3>On-hand stock</h3><p>{balances.total} item-location {balances.total === 1 ? "balance" : "balances"} at {office.name}.</p></div></div>
      <div className="pm-catalog-body"><StockBalances result={balances} officeId={officeId} /></div>
    </section>}

    {office && <section className="om-subpanel">
      <div className="om-subpanel-heading"><div><h3>Deploy, return, or transfer</h3><p>Move stock within {office.name}. Source availability is checked and updated atomically when the movement is saved.</p></div></div>
      {canManageLocations ? <TransferStockForm key={officeId} officeId={officeId} locations={transferLocations.rows} items={receiptItems.rows} initialRequestKey={randomUUID()} />
        : <EmptyPanel title="Movement access required" message="Your role can view stock but cannot deploy, return, or transfer it." />}
      {(receiptItems.total > receiptItems.rows.length || transferLocations.total > transferLocations.rows.length) && <p className="pm-muted pm-selector-note">The movement selectors show the first 50 active items and locations.</p>}
    </section>}

    {office && <section className="om-subpanel">
      <div className="om-subpanel-heading"><div><h3>Consumption, damage, and physical counts</h3><p>Record reasoned changes against the current location balance. Counts save the version observed here and ask you to recount if stock changes first.</p></div></div>
      {canManageLocations ? <StockAdjustmentForm key={officeId} officeId={officeId} locations={transferLocations.rows} items={receiptItems.rows} balances={adjustmentBalances.rows} balancesComplete={adjustmentBalances.total <= adjustmentBalances.rows.length} canCorrect={hasCapability(context, "stock:correct")} initialRequestKey={randomUUID()} />
        : <EmptyPanel title="Adjustment access required" message="Your role can view stock but cannot record consumption, damage, or count corrections." />}
      <Pagination result={adjustmentBalances} query={{ office: officeId }} pageKey="adjustmentPage" label="Countable balances" />
      {adjustmentBalances.total > adjustmentBalances.rows.length && <p className="pm-muted pm-selector-note">Count versions use the selected 50-balance page. Movement IDs are shown in history so a correction can reference any prior entry.</p>}
    </section>}

    {office && <section className="om-subpanel">
      <div className="om-subpanel-heading"><div><h3>Movement history</h3><p>Immutable record of receipts and every later stock movement at {office.name}.</p></div></div>
      <div className="pm-catalog-body"><StockMovements result={movements} officeId={officeId} timezone={office.timezone} /></div>
    </section>}

    <section className="om-subpanel">
      <div className="om-subpanel-heading"><div><h3>Shared item catalog</h3><p>Whole base units only. No conversions or stock quantities are stored here.</p></div></div>
      <div className="pm-catalog-body">
        <ItemList result={items} canManage={canManageCatalog} query={itemQuery} />
        {canManageCatalog && <div className="pm-create-panel"><h4>Add a catalog item</h4><CatalogItemForm /></div>}
      </div>
    </section>

    <section className="om-subpanel">
      <div className="om-subpanel-heading"><div><h3>Stock locations</h3><p>Office storerooms, pantries, and room-level stock locations. Balances are added only through stock receipts.</p></div></div>
      {offices.total === 0 ? <EmptyPanel title="No active offices" message="Create an office before setting up stock locations." /> : <div className="pm-catalog-body">
        <div className="pm-office-picker">
          <form method="get" action="/dashboard"><input type="hidden" name="view" value="inventory" />
            <label htmlFor="inventory-office">Office</label>
            <select id="inventory-office" name="office" defaultValue={officeId}>
              {!offices.rows.some((row) => row.id === officeId) && office && <option value={office.id}>{office.name}</option>}
              {offices.rows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select><button type="submit">Open office</button>
          </form>
          {offices.total > offices.rows.length && <span>Showing the first {offices.rows.length} active offices in this selector.</span>}
        </div>
        {office && <p className="pm-selected-office">Managing locations for <strong>{office.name}</strong></p>}
        <LocationList officeId={officeId} result={locations} canManage={canManageLocations} query={searchParams} />
        {canManageLocations && officeId && <div className="pm-create-panel"><h4>Add an office storeroom or pantry</h4><StorageLocationForm officeId={officeId} /></div>}
        {canManageLocations && officeId && <div className="pm-create-panel"><h4>Room stock locations</h4>
          <p className="pm-muted">Set up one stock location for each active room. Repeating the setup is safe.</p>
          {untrackedRooms.length ? <div className="pm-room-location-list">{untrackedRooms.map((room) => <EnsureRoomLocationForm key={room.id} officeId={officeId} room={room} />)}</div> : <p className="pm-muted">Every active room on the first 50 rooms has a stock location.</p>}
        </div>}
      </div>}
    </section>
  </div>;
}
