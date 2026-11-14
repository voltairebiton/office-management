"use client";

import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import {
  archiveCatalogItemAction,
  archiveStockLocationAction,
  adjustStockAction,
  ensureRoomStockLocationAction,
  receiveStockAction,
  saveCatalogItemAction,
  saveStorageLocationAction,
  transferStockAction,
} from "@/app/actions";
import {
  clearReceiptDraft,
  getReceiptDraftSnapshot,
  parseReceiptDraft,
  saveReceiptDraft,
  subscribeReceiptDraft,
} from "@/lib/receipt-draft";
import {
  clearTransferDraft,
  getTransferDraftSnapshot,
  parseTransferDraft,
  saveTransferDraft,
  subscribeTransferDraft,
} from "@/lib/transfer-draft";
import {
  clearAdjustmentDraft,
  getAdjustmentDraftSnapshot,
  parseAdjustmentDraft,
  saveAdjustmentDraft,
  subscribeAdjustmentDraft,
} from "@/lib/adjustment-draft";

const initialState = { ok: false, error: null, message: "" };

function Message({ state }) {
  if (state?.ok) return <p className="om-feedback is-success" role="status">{state.message}</p>;
  if (state?.error) return <div className="om-feedback is-error" role="alert"><strong>{state.error.message}</strong></div>;
  return null;
}

function CatalogField({ label, name, value = "", required = false, maxLength, placeholder }) {
  return <label className="om-field"><span>{label}{required && <span aria-hidden="true"> *</span>}</span>
    <input name={name} defaultValue={value} required={required} maxLength={maxLength} placeholder={placeholder} />
  </label>;
}

export function CatalogItemForm({ item = null }) {
  const [state, formAction, pending] = useActionState(saveCatalogItemAction, initialState);
  const editing = Boolean(item);
  return <form action={formAction} className="om-form pm-catalog-form">
    {item && <><input type="hidden" name="itemId" value={item.id} /><input type="hidden" name="expectedUpdatedAt" value={item.updatedAt.toISOString()} /></>}
    <div className="om-form-grid">
      <CatalogField name="sku" label="SKU / item code" required value={item?.sku} maxLength={32} placeholder="e.g. TISSUE-BOX" />
      <CatalogField name="name" label="Item name" required value={item?.name} maxLength={120} placeholder="e.g. Facial tissues" />
      <label className="om-field"><span>Category *</span><select name="category" defaultValue={item?.category ?? "consumable"} required><option value="consumable">Consumable</option><option value="reusable">Reusable</option></select></label>
      <CatalogField name="unit" label="Base unit" required value={item?.unit} maxLength={24} placeholder="e.g. box, piece, pack" />
    </div>
    <div className="om-form-actions">
      <button className="om-primary" type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save item" : "Add catalog item"}</button>
      <Message state={state} />
    </div>
  </form>;
}

export function ArchiveCatalogItemForm({ itemId, name }) {
  const [state, formAction, pending] = useActionState(archiveCatalogItemAction, initialState);
  return <form action={formAction} className="pm-inline-form" onSubmit={(event) => {
    if (!window.confirm(`Archive ${name}? Its catalog history will be retained.`)) event.preventDefault();
  }}>
    <input type="hidden" name="itemId" value={itemId} />
    <button className="om-danger" type="submit" disabled={pending}>{pending ? "Archiving…" : "Archive item"}</button>
    <Message state={state} />
  </form>;
}

export function StorageLocationForm({ officeId, location = null }) {
  const [state, formAction, pending] = useActionState(saveStorageLocationAction, initialState);
  const editing = Boolean(location);
  return <form action={formAction} className="om-form pm-catalog-form">
    <input type="hidden" name="officeId" value={officeId} />
    {location && <><input type="hidden" name="locationId" value={location.id} /><input type="hidden" name="expectedUpdatedAt" value={location.updatedAt.toISOString()} /></>}
    <div className="om-form-grid">
      <CatalogField name="code" label="Location code" required value={location?.code} maxLength={32} placeholder="e.g. PANTRY" />
      <CatalogField name="name" label="Location name" required value={location?.name} maxLength={120} placeholder="e.g. Main pantry" />
    </div>
    <div className="om-form-actions"><button className="om-primary" type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save location" : "Add storage location"}</button><Message state={state} /></div>
  </form>;
}

export function ArchiveStockLocationForm({ officeId, locationId, name }) {
  const [state, formAction, pending] = useActionState(archiveStockLocationAction, initialState);
  return <form action={formAction} className="pm-inline-form" onSubmit={(event) => {
    if (!window.confirm(`Archive ${name}? Its history will be retained.`)) event.preventDefault();
  }}>
    <input type="hidden" name="officeId" value={officeId} /><input type="hidden" name="locationId" value={locationId} />
    <button className="om-danger" type="submit" disabled={pending}>{pending ? "Archiving…" : "Archive"}</button><Message state={state} />
  </form>;
}

export function EnsureRoomLocationForm({ officeId, room }) {
  const [state, formAction, pending] = useActionState(ensureRoomStockLocationAction, initialState);
  return <form action={formAction} className="pm-room-location-form">
    <input type="hidden" name="officeId" value={officeId} /><input type="hidden" name="roomId" value={room.id} />
    <span><strong>{room.name}</strong><small>{room.code}</small></span>
    <button className="om-primary" type="submit" disabled={pending}>{pending ? "Setting up…" : "Create room location"}</button><Message state={state} />
  </form>;
}

function newRequestKey() {
  return window.crypto.randomUUID();
}

function browserStorage() {
  try { return window.localStorage; } catch { return null; }
}

export function ReceiveStockForm({ officeId, locations, items, initialRequestKey }) {
  const [state, formAction, pending] = useActionState(receiveStockAction, initialState);
  const [manualRequestKey, setManualRequestKey] = useState(null);
  const [manualDraft, setManualDraft] = useState(null);
  const savedDraftText = useSyncExternalStore(
    (callback) => subscribeReceiptDraft(officeId, callback),
    () => getReceiptDraftSnapshot(browserStorage(), officeId),
    () => "",
  );
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);
  const savedDraft = parseReceiptDraft(savedDraftText);
  const defaultDraft = {
    itemId: items[0]?.id ?? "",
    locationId: locations[0]?.id ?? "",
    quantity: "1",
    reason: "replenishment",
    reference: "",
  };
  const draft = manualDraft ?? (savedDraft ? {
    itemId: savedDraft.itemId,
    locationId: savedDraft.locationId,
    quantity: savedDraft.quantity,
    reason: savedDraft.reason,
    reference: savedDraft.reference,
  } : defaultDraft);
  const requestKey = state?.ok && state.transactionId
    ? state.nextRequestKey
    : savedDraft?.requestKey ?? manualRequestKey ?? initialRequestKey;
  const [storageWarning, setStorageWarning] = useState(false);

  useEffect(() => {
    if (savedDraftText && state?.ok && state.transactionId) clearReceiptDraft(browserStorage(), officeId);
    if (savedDraftText && !parseReceiptDraft(savedDraftText)) clearReceiptDraft(browserStorage(), officeId);
  }, [officeId, savedDraftText, state?.ok, state?.transactionId]);

  function updateField(event) {
    const { name, value } = event.currentTarget;
    if (savedDraft) {
      clearReceiptDraft(browserStorage(), officeId);
      setManualRequestKey(newRequestKey());
    }
    setManualDraft((current) => ({ ...(current ?? draft), [name]: value }));
  }

  function persistPendingSubmission(event) {
    const data = new FormData(event.currentTarget);
    const saved = saveReceiptDraft(browserStorage(), officeId, {
      requestKey,
      itemId: String(data.get("itemId") ?? ""),
      locationId: String(data.get("locationId") ?? ""),
      quantity: String(data.get("quantity") ?? ""),
      reason: String(data.get("reason") ?? ""),
      reference: String(data.get("reference") ?? ""),
    });
    setStorageWarning(!saved);
  }

  const disabled = pending || !hydrated || !items.length || !locations.length;
  const fieldErrors = state?.error?.fieldErrors ?? {};
  return <form action={formAction} className="om-form pm-catalog-form pm-receipt-form" onSubmit={persistPendingSubmission}>
    <input type="hidden" name="officeId" value={officeId} />
    <input type="hidden" name="requestKey" value={requestKey} />
    <div className="om-form-grid">
      <label className="om-field" htmlFor={`receipt-item-${officeId}`}><span>Item *</span>
        <select id={`receipt-item-${officeId}`} name="itemId" value={draft.itemId} onChange={updateField} required disabled={disabled} aria-invalid={Boolean(fieldErrors.itemId)}>
          {!items.some((item) => item.id === draft.itemId) && draft.itemId && <option value={draft.itemId}>Previously selected item — choose an active item</option>}
          {items.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name} ({item.unit})</option>)}
        </select>
        {fieldErrors.itemId && <small className="om-field-error">{fieldErrors.itemId}</small>}
      </label>
      <label className="om-field" htmlFor={`receipt-location-${officeId}`}><span>Receive into *</span>
        <select id={`receipt-location-${officeId}`} name="locationId" value={draft.locationId} onChange={updateField} required disabled={disabled} aria-invalid={Boolean(fieldErrors.locationId)}>
          {!locations.some((location) => location.id === draft.locationId) && draft.locationId && <option value={draft.locationId}>Previously selected location — choose active storage</option>}
          {locations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}
        </select>
        {fieldErrors.locationId && <small className="om-field-error">{fieldErrors.locationId}</small>}
      </label>
      <label className="om-field" htmlFor={`receipt-quantity-${officeId}`}><span>Quantity *</span>
        <input id={`receipt-quantity-${officeId}`} type="number" name="quantity" min="1" max="2147483647" step="1" inputMode="numeric" value={draft.quantity} onChange={updateField} required disabled={disabled} aria-invalid={Boolean(fieldErrors.quantity)} />
        {fieldErrors.quantity && <small className="om-field-error">{fieldErrors.quantity}</small>}
      </label>
      <label className="om-field" htmlFor={`receipt-reason-${officeId}`}><span>Reason *</span>
        <select id={`receipt-reason-${officeId}`} name="reason" value={draft.reason} onChange={updateField} required disabled={disabled} aria-invalid={Boolean(fieldErrors.reason)}>
          <option value="replenishment">Replenishment</option><option value="opening">Opening stock</option>
        </select>
        {fieldErrors.reason && <small className="om-field-error">{fieldErrors.reason}</small>}
      </label>
      <label className="om-field pm-receipt-reference" htmlFor={`receipt-reference-${officeId}`}><span>Reference (optional)</span>
        <input id={`receipt-reference-${officeId}`} name="reference" value={draft.reference} onChange={updateField} maxLength={120} placeholder="Delivery note or purchase reference" disabled={disabled} />
        {fieldErrors.reference && <small className="om-field-error">{fieldErrors.reference}</small>}
      </label>
    </div>
    <div className="om-form-actions">
      <button className="om-primary" type="submit" disabled={disabled}>{pending ? "Recording receipt…" : !hydrated ? "Preparing secure retry…" : "Record stock receipt"}</button>
      <Message state={state} />
    </div>
    {storageWarning && <p className="om-feedback is-error" role="status">This browser could not save the pending retry key. Keep this page open until the receipt result appears.</p>}
    {savedDraft && hydrated && <p className="pm-muted" role="status">A pending receipt was restored. Submitting it again safely retries the same request.</p>}
    {!items.length && <p className="pm-muted">Add an active catalog item before receiving stock.</p>}
    {!locations.length && <p className="pm-muted">Create an active storeroom or pantry before receiving stock.</p>}
  </form>;
}

function transferLocations(intent, direction, locations, excludeId = "") {
  const kind = intent === "deployment"
    ? direction === "source" ? "storage" : "room"
    : intent === "return"
      ? direction === "source" ? "room" : "storage"
      : null;
  return locations.filter((location) => (!kind || location.kind === kind) && location.id !== excludeId);
}

export function TransferStockForm({ officeId, locations, items, initialRequestKey }) {
  const [state, formAction, pending] = useActionState(transferStockAction, initialState);
  const [manualRequestKey, setManualRequestKey] = useState(null);
  const [manualDraft, setManualDraft] = useState(null);
  const savedDraftText = useSyncExternalStore(
    (callback) => subscribeTransferDraft(officeId, callback),
    () => getTransferDraftSnapshot(browserStorage(), officeId),
    () => "",
  );
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);
  const savedDraft = parseTransferDraft(savedDraftText);
  const hasStorage = locations.some((location) => location.kind === "storage");
  const hasRoom = locations.some((location) => location.kind === "room");
  const initialIntent = hasStorage && hasRoom ? "deployment" : "transfer";
  const defaultSources = transferLocations(initialIntent, "source", locations);
  const defaultDestinations = transferLocations(initialIntent, "destination", locations, defaultSources[0]?.id ?? "");
  const defaultDraft = {
    itemId: items[0]?.id ?? "",
    sourceLocationId: defaultSources[0]?.id ?? "",
    destinationLocationId: defaultDestinations[0]?.id ?? "",
    quantity: "1",
    intent: initialIntent,
    reference: "",
  };
  const draft = manualDraft ?? (savedDraft ? {
    sourceLocationId: savedDraft.sourceLocationId,
    destinationLocationId: savedDraft.destinationLocationId,
    itemId: savedDraft.itemId,
    quantity: savedDraft.quantity,
    intent: savedDraft.intent,
    reference: savedDraft.reference,
  } : defaultDraft);
  const requestKey = state?.ok && state.transactionId
    ? state.nextRequestKey
    : savedDraft?.requestKey ?? manualRequestKey ?? initialRequestKey;
  const [storageWarning, setStorageWarning] = useState(false);
  const sourceOptions = transferLocations(draft.intent, "source", locations);
  const destinationOptions = transferLocations(draft.intent, "destination", locations, draft.sourceLocationId);

  useEffect(() => {
    if (savedDraftText && state?.ok && state.transactionId) clearTransferDraft(browserStorage(), officeId);
    if (savedDraftText && !parseTransferDraft(savedDraftText)) clearTransferDraft(browserStorage(), officeId);
  }, [officeId, savedDraftText, state?.ok, state?.transactionId]);

  function updateField(event) {
    const { name, value } = event.currentTarget;
    if (savedDraft) {
      clearTransferDraft(browserStorage(), officeId);
      setManualRequestKey(newRequestKey());
    }
    setManualDraft((current) => {
      const next = { ...(current ?? draft), [name]: value };
      if (name === "intent") {
        const sources = transferLocations(value, "source", locations);
        const source = sources.some((location) => location.id === next.sourceLocationId) ? next.sourceLocationId : sources[0]?.id ?? "";
        const destinations = transferLocations(value, "destination", locations, source);
        const destination = destinations.some((location) => location.id === next.destinationLocationId)
          ? next.destinationLocationId
          : destinations[0]?.id ?? "";
        next.sourceLocationId = source;
        next.destinationLocationId = destination;
      } else if (name === "sourceLocationId" && next.destinationLocationId === value) {
        next.destinationLocationId = transferLocations(next.intent, "destination", locations, value)[0]?.id ?? "";
      }
      return next;
    });
  }

  function persistPendingSubmission(event) {
    const data = new FormData(event.currentTarget);
    const saved = saveTransferDraft(browserStorage(), officeId, {
      requestKey,
      sourceLocationId: String(data.get("sourceLocationId") ?? ""),
      destinationLocationId: String(data.get("destinationLocationId") ?? ""),
      itemId: String(data.get("itemId") ?? ""),
      quantity: String(data.get("quantity") ?? ""),
      intent: String(data.get("intent") ?? ""),
      reference: String(data.get("reference") ?? ""),
    });
    setStorageWarning(!saved);
  }

  const disabled = pending || !hydrated || !items.length;
  const fieldErrors = state?.error?.fieldErrors ?? {};
  return <form action={formAction} className="om-form pm-catalog-form pm-receipt-form" onSubmit={persistPendingSubmission}>
    <input type="hidden" name="officeId" value={officeId} />
    <input type="hidden" name="requestKey" value={requestKey} />
    <div className="om-form-grid">
      <label className="om-field" htmlFor={`transfer-intent-${officeId}`}><span>Movement *</span>
        <select id={`transfer-intent-${officeId}`} name="intent" value={draft.intent} onChange={updateField} required disabled={disabled}>
          <option value="deployment">Deploy to a room</option><option value="return">Return to storage</option><option value="transfer">Transfer between locations</option>
        </select>
      </label>
      <label className="om-field" htmlFor={`transfer-item-${officeId}`}><span>Item *</span>
        <select id={`transfer-item-${officeId}`} name="itemId" value={draft.itemId} onChange={updateField} required disabled={disabled} aria-invalid={Boolean(fieldErrors.itemId)}>
          <option value="">Choose an active item</option>
          {!items.some((item) => item.id === draft.itemId) && draft.itemId && <option value={draft.itemId}>Previously selected item — choose an active item</option>}
          {items.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name} ({item.unit})</option>)}
        </select>
        {fieldErrors.itemId && <small className="om-field-error">{fieldErrors.itemId}</small>}
      </label>
      <label className="om-field" htmlFor={`transfer-source-${officeId}`}><span>From *</span>
        <select id={`transfer-source-${officeId}`} name="sourceLocationId" value={draft.sourceLocationId} onChange={updateField} required disabled={disabled || !sourceOptions.length} aria-invalid={Boolean(fieldErrors.sourceLocationId)}>
          <option value="">Choose source</option>{sourceOptions.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}
        </select>
        {fieldErrors.sourceLocationId && <small className="om-field-error">{fieldErrors.sourceLocationId}</small>}
      </label>
      <label className="om-field" htmlFor={`transfer-destination-${officeId}`}><span>To *</span>
        <select id={`transfer-destination-${officeId}`} name="destinationLocationId" value={draft.destinationLocationId} onChange={updateField} required disabled={disabled || !destinationOptions.length} aria-invalid={Boolean(fieldErrors.destinationLocationId)}>
          <option value="">Choose destination</option>{destinationOptions.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}
        </select>
        {fieldErrors.destinationLocationId && <small className="om-field-error">{fieldErrors.destinationLocationId}</small>}
      </label>
      <label className="om-field" htmlFor={`transfer-quantity-${officeId}`}><span>Quantity *</span>
        <input id={`transfer-quantity-${officeId}`} type="number" name="quantity" min="1" max="2147483647" step="1" inputMode="numeric" value={draft.quantity} onChange={updateField} required disabled={disabled} aria-invalid={Boolean(fieldErrors.quantity)} />
        {fieldErrors.quantity && <small className="om-field-error">{fieldErrors.quantity}</small>}
      </label>
      <label className="om-field pm-receipt-reference" htmlFor={`transfer-reference-${officeId}`}><span>Reference (optional)</span>
        <input id={`transfer-reference-${officeId}`} name="reference" value={draft.reference} onChange={updateField} maxLength={120} placeholder="Room setup or return note" disabled={disabled} />
        {fieldErrors.reference && <small className="om-field-error">{fieldErrors.reference}</small>}
      </label>
    </div>
    <div className="om-form-actions">
      <button className="om-primary" type="submit" disabled={disabled || !sourceOptions.length || !destinationOptions.length}>{pending ? "Recording movement…" : !hydrated ? "Preparing secure retry…" : "Record movement"}</button>
      <Message state={state} />
    </div>
    {storageWarning && <p className="om-feedback is-error" role="status">This browser could not save the pending retry key. Keep this page open until the movement result appears.</p>}
    {savedDraft && hydrated && <p className="pm-muted" role="status">A pending movement was restored. Submitting it again safely retries the same request.</p>}
    {!locations.length && <p className="pm-muted">Set up active storage locations and room locations before moving stock.</p>}
    {locations.length === 1 && <p className="pm-muted">Add another location before recording a transfer.</p>}
    {!items.length && <p className="pm-muted">Add an active catalog item before moving stock.</p>}
  </form>;
}

function findBalance(balances, locationId, itemId) {
  return balances.find((balance) => balance.locationId === locationId && balance.itemId === itemId) ?? null;
}

export function StockAdjustmentForm({ officeId, locations, items, balances, balancesComplete = true, canCorrect = false, initialRequestKey }) {
  const [state, formAction, pending] = useActionState(adjustStockAction, initialState);
  const [manualRequestKey, setManualRequestKey] = useState(null);
  const [manualDraft, setManualDraft] = useState(null);
  const savedDraftText = useSyncExternalStore(
    (callback) => subscribeAdjustmentDraft(officeId, callback),
    () => getAdjustmentDraftSnapshot(browserStorage(), officeId),
    () => "",
  );
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);
  const savedDraft = parseAdjustmentDraft(savedDraftText);
  const initialItem = items.find((item) => item.category === "consumable") ?? items[0];
  const defaultDraft = {
    itemId: initialItem?.id ?? "",
    locationId: locations[0]?.id ?? "",
    operation: "consumption",
    quantity: "1",
    countedQuantity: "",
    expectedVersion: "",
    reason: "",
    reference: "",
    reversalOfMovementId: "",
  };
  const draft = manualDraft ?? (savedDraft ? {
    itemId: savedDraft.itemId,
    locationId: savedDraft.locationId,
    operation: savedDraft.operation,
    quantity: savedDraft.quantity,
    countedQuantity: savedDraft.countedQuantity,
    expectedVersion: savedDraft.expectedVersion,
    reason: savedDraft.reason,
    reference: savedDraft.reference,
    reversalOfMovementId: savedDraft.reversalOfMovementId,
  } : defaultDraft);
  const requestKey = state?.ok && state.transactionId
    ? state.nextRequestKey
    : savedDraft?.requestKey ?? manualRequestKey ?? initialRequestKey;
  const [storageWarning, setStorageWarning] = useState(false);
  const selectedBalance = findBalance(balances, draft.locationId, draft.itemId);
  const currentQuantity = selectedBalance?.quantity ?? 0;
  const currentVersion = selectedBalance?.version ?? 0;
  const countVersionAvailable = Boolean(selectedBalance) || balancesComplete;

  useEffect(() => {
    if (savedDraftText && state?.ok && state.transactionId) clearAdjustmentDraft(browserStorage(), officeId);
    if (savedDraftText && !parseAdjustmentDraft(savedDraftText)) clearAdjustmentDraft(browserStorage(), officeId);
  }, [officeId, savedDraftText, state?.ok, state?.transactionId]);

  function updateField(event) {
    const { name, value } = event.currentTarget;
    if (savedDraft) {
      clearAdjustmentDraft(browserStorage(), officeId);
      setManualRequestKey(newRequestKey());
    }
    setManualDraft((current) => {
      const next = { ...(current ?? draft), [name]: value };
      if (name === "operation") {
        if (value === "count_correction") {
          next.quantity = "";
          next.countedQuantity = "";
          next.expectedVersion = String(findBalance(balances, next.locationId, next.itemId)?.version ?? 0);
          next.reversalOfMovementId = "";
        } else {
          next.quantity = next.quantity || "1";
          next.countedQuantity = "";
          next.expectedVersion = "";
          next.reversalOfMovementId = "";
        }
      }
      if ((name === "itemId" || name === "locationId") && next.operation === "count_correction") {
        next.countedQuantity = "";
        next.expectedVersion = String(findBalance(balances, next.locationId, next.itemId)?.version ?? 0);
        next.reversalOfMovementId = "";
      }
      return next;
    });
  }

  function persistPendingSubmission(event) {
    const data = new FormData(event.currentTarget);
    const saved = saveAdjustmentDraft(browserStorage(), officeId, {
      requestKey,
      locationId: String(data.get("locationId") ?? ""),
      itemId: String(data.get("itemId") ?? ""),
      operation: String(data.get("operation") ?? ""),
      quantity: String(data.get("quantity") ?? ""),
      countedQuantity: String(data.get("countedQuantity") ?? ""),
      expectedVersion: String(data.get("expectedVersion") ?? ""),
      reason: String(data.get("reason") ?? ""),
      reference: String(data.get("reference") ?? ""),
      reversalOfMovementId: String(data.get("reversalOfMovementId") ?? ""),
    });
    setStorageWarning(!saved);
  }

  const isCount = draft.operation === "count_correction";
  const disabled = pending || !hydrated || !items.length || !locations.length;
  const fieldErrors = state?.error?.fieldErrors ?? {};
  return <form action={formAction} className="om-form pm-catalog-form pm-receipt-form" onSubmit={persistPendingSubmission}>
    <input type="hidden" name="officeId" value={officeId} />
    <input type="hidden" name="requestKey" value={requestKey} />
    {isCount ? <>
      <input type="hidden" name="quantity" value="" />
      <input type="hidden" name="expectedVersion" value={draft.expectedVersion} />
    </> : <>
      <input type="hidden" name="countedQuantity" value="" />
      <input type="hidden" name="expectedVersion" value="" />
      <input type="hidden" name="reversalOfMovementId" value="" />
    </>}
    <div className="om-form-grid">
      <label className="om-field" htmlFor={`adjustment-operation-${officeId}`}><span>Stock change *</span>
        <select id={`adjustment-operation-${officeId}`} name="operation" value={draft.operation} onChange={updateField} required disabled={disabled}>
          <option value="consumption">Record consumption</option><option value="damage">Record damage or loss</option>{canCorrect && <option value="count_correction">Physical count correction</option>}
        </select>
      </label>
      <label className="om-field" htmlFor={`adjustment-item-${officeId}`}><span>Item *</span>
        <select id={`adjustment-item-${officeId}`} name="itemId" value={draft.itemId} onChange={updateField} required disabled={disabled} aria-invalid={Boolean(fieldErrors.itemId)}>
          <option value="">Choose an active item</option>
          {!items.some((item) => item.id === draft.itemId) && draft.itemId && <option value={draft.itemId}>Previously selected item — choose an active item</option>}
          {items.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name} ({item.category}; {item.unit})</option>)}
        </select>
        {fieldErrors.itemId && <small className="om-field-error">{fieldErrors.itemId}</small>}
      </label>
      <label className="om-field" htmlFor={`adjustment-location-${officeId}`}><span>Location *</span>
        <select id={`adjustment-location-${officeId}`} name="locationId" value={draft.locationId} onChange={updateField} required disabled={disabled} aria-invalid={Boolean(fieldErrors.locationId)}>
          <option value="">Choose an active location</option>
          {!locations.some((location) => location.id === draft.locationId) && draft.locationId && <option value={draft.locationId}>Previously selected location — choose an active location</option>}
          {locations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}
        </select>
        {fieldErrors.locationId && <small className="om-field-error">{fieldErrors.locationId}</small>}
      </label>
      {isCount ? <label className="om-field" htmlFor={`adjustment-count-${officeId}`}><span>Physical count *</span>
        <input id={`adjustment-count-${officeId}`} type="number" name="countedQuantity" min="0" max="2147483647" step="1" inputMode="numeric" value={draft.countedQuantity} onChange={updateField} required disabled={disabled} aria-invalid={Boolean(fieldErrors.countedQuantity)} />
        {fieldErrors.countedQuantity && <small className="om-field-error">{fieldErrors.countedQuantity}</small>}
      </label> : <label className="om-field" htmlFor={`adjustment-quantity-${officeId}`}><span>Quantity *</span>
        <input id={`adjustment-quantity-${officeId}`} type="number" name="quantity" min="1" max="2147483647" step="1" inputMode="numeric" value={draft.quantity} onChange={updateField} required disabled={disabled} aria-invalid={Boolean(fieldErrors.quantity)} />
        {fieldErrors.quantity && <small className="om-field-error">{fieldErrors.quantity}</small>}
      </label>}
      <label className="om-field" htmlFor={`adjustment-reason-${officeId}`}><span>Reason *</span>
        <input id={`adjustment-reason-${officeId}`} name="reason" value={draft.reason} onChange={updateField} maxLength={120} required disabled={disabled} aria-invalid={Boolean(fieldErrors.reason)} placeholder={isCount ? "e.g. Monthly physical count" : "e.g. Used for visitors or damaged in storage"} />
        {fieldErrors.reason && <small className="om-field-error">{fieldErrors.reason}</small>}
      </label>
      {isCount && <label className="om-field" htmlFor={`adjustment-reversal-${officeId}`}><span>Original movement ID (optional)</span>
        <input id={`adjustment-reversal-${officeId}`} name="reversalOfMovementId" value={draft.reversalOfMovementId} onChange={updateField} maxLength={36} pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" placeholder="Paste an ID from movement history" disabled={disabled} aria-invalid={Boolean(fieldErrors.reversalOfMovementId)} />
        {fieldErrors.reversalOfMovementId && <small className="om-field-error">{fieldErrors.reversalOfMovementId}</small>}
      </label>}
      <label className="om-field pm-receipt-reference" htmlFor={`adjustment-reference-${officeId}`}><span>Reference (optional)</span>
        <input id={`adjustment-reference-${officeId}`} name="reference" value={draft.reference} onChange={updateField} maxLength={120} placeholder="Incident or count-sheet reference" disabled={disabled} />
        {fieldErrors.reference && <small className="om-field-error">{fieldErrors.reference}</small>}
      </label>
    </div>
    <p className="pm-muted">Current recorded quantity: <strong>{currentQuantity} {items.find((item) => item.id === draft.itemId)?.unit ?? "units"}</strong> · version {currentVersion}. The server rechecks availability and count version when saved.</p>
    <div className="om-form-actions">
      <button className="om-primary" type="submit" disabled={disabled || (isCount && !countVersionAvailable)}>{pending ? "Recording stock change…" : !hydrated ? "Preparing secure retry…" : isCount ? "Save physical count" : "Record stock change"}</button>
      <Message state={state} />
    </div>
    {isCount && !countVersionAvailable && <p className="om-feedback is-error" role="status">This item and location are outside the selected balance page. Choose a listed balance or open another balance page first.</p>}
    {storageWarning && <p className="om-feedback is-error" role="status">This browser could not save the pending retry key. Keep this page open until the stock change result appears.</p>}
    {savedDraft && hydrated && <p className="pm-muted" role="status">A pending stock change was restored. Submitting it again safely retries the same request and count version.</p>}
    {!items.length && <p className="pm-muted">Add an active catalog item before recording stock changes.</p>}
    {!locations.length && <p className="pm-muted">Create an active stock location before recording stock changes.</p>}
  </form>;
}
