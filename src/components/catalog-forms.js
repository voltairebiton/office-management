"use client";

import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
import {
  archiveCatalogItemAction,
  archiveStockLocationAction,
  ensureRoomStockLocationAction,
  receiveStockAction,
  saveCatalogItemAction,
  saveStorageLocationAction,
} from "@/app/actions";
import {
  clearReceiptDraft,
  getReceiptDraftSnapshot,
  parseReceiptDraft,
  saveReceiptDraft,
  subscribeReceiptDraft,
} from "@/lib/receipt-draft";

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
