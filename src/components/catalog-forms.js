"use client";

import { useActionState } from "react";
import {
  archiveCatalogItemAction,
  archiveStockLocationAction,
  ensureRoomStockLocationAction,
  saveCatalogItemAction,
  saveStorageLocationAction,
} from "@/app/actions";

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
