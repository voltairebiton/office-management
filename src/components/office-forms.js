"use client";

import { useActionState } from "react";
import {
  archiveOfficeAction,
  archiveRoomAction,
  saveOfficeAction,
  saveRoomAction,
} from "@/app/actions";

const emptyState = { ok: false, error: null, message: "" };

function Feedback({ state }) {
  if (state?.ok) return <p className="om-feedback is-success" role="status">{state.message}</p>;
  if (state?.error) return <div className="om-feedback is-error" role="alert">
    <strong>{state.error.message}</strong>
    {Object.keys(state.error.dependents ?? {}).length > 0 && <p>
      {Object.entries(state.error.dependents).map(([label, count]) => `${count} ${label.replaceAll(/([A-Z])/g, " $1").toLowerCase()}`).join(" · ")} need attention before archiving.
    </p>}
  </div>;
  return null;
}

function Field({ label, name, defaultValue = "", required = false, error, type = "text", placeholder, maxLength, min, max, step }) {
  const errorId = `${name}-error`;
  return <label className="om-field">
    <span>{label}{required && <span aria-hidden="true"> *</span>}</span>
    <input
      name={name}
      type={type}
      defaultValue={defaultValue}
      required={required}
      placeholder={placeholder}
      maxLength={maxLength}
      min={min}
      max={max}
      step={step}
      aria-invalid={error ? "true" : undefined}
      aria-describedby={error ? errorId : undefined}
    />
    {error && <small id={errorId} className="om-field-error">{error}</small>}
  </label>;
}

export function OfficeForm({ office }) {
  const [state, formAction, pending] = useActionState(saveOfficeAction, emptyState);
  const errors = state?.error?.fieldErrors ?? {};
  const editing = Boolean(office);
  return <form action={formAction} className="om-form">
    {editing && <>
      <input type="hidden" name="officeId" value={office.id} />
      <input type="hidden" name="expectedUpdatedAt" value={office.updatedAt.toISOString()} />
    </>}
    <div className="om-form-grid">
      <Field name="name" label="Office name" required defaultValue={office?.name} maxLength={120} error={errors.name} placeholder="e.g. Manila HQ" />
      <Field name="code" label="Office code" required defaultValue={office?.code} maxLength={32} error={errors.code} placeholder="e.g. MNL-HQ" />
      <Field name="timezone" label="Time zone" defaultValue={office?.timezone ?? "UTC"} maxLength={80} error={errors.timezone} placeholder="Asia/Manila" />
      <Field name="address" label="Address" defaultValue={office?.address ?? ""} maxLength={240} error={errors.address} placeholder="Optional" />
    </div>
    <div className="om-form-actions">
      <button className="om-primary" type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save office" : "Add office"}</button>
      <Feedback state={state} />
    </div>
  </form>;
}

export function RoomForm({ officeId, room }) {
  const [state, formAction, pending] = useActionState(saveRoomAction, emptyState);
  const errors = state?.error?.fieldErrors ?? {};
  const editing = Boolean(room);
  return <form action={formAction} className="om-form">
    <input type="hidden" name="officeId" value={officeId} />
    {editing && <>
      <input type="hidden" name="roomId" value={room.id} />
      <input type="hidden" name="expectedUpdatedAt" value={room.updatedAt.toISOString()} />
    </>}
    <div className="om-form-grid">
      <Field name="name" label="Room name" required defaultValue={room?.name} maxLength={120} error={errors.name} placeholder="e.g. Boardroom" />
      <Field name="code" label="Room code" required defaultValue={room?.code} maxLength={32} error={errors.code} placeholder="e.g. BR-1" />
      <Field name="capacity" label="Capacity" type="number" defaultValue={room?.capacity ?? ""} error={errors.capacity} placeholder="Optional" min={0} max={2147483647} step={1} />
    </div>
    <div className="om-form-actions">
      <button className="om-primary" type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save room" : "Add room"}</button>
      <Feedback state={state} />
    </div>
  </form>;
}

export function ArchiveOfficeForm({ officeId }) {
  const [state, formAction, pending] = useActionState(archiveOfficeAction, emptyState);
  return <form action={formAction} className="om-inline-form" onSubmit={(event) => {
    if (!window.confirm("Archive this office? It will leave active selectors, and its history will be retained.")) event.preventDefault();
  }}>
    <input type="hidden" name="officeId" value={officeId} />
    <button className="om-danger" type="submit" disabled={pending}>{pending ? "Archiving…" : "Archive office"}</button>
    <Feedback state={state} />
  </form>;
}

export function ArchiveRoomForm({ officeId, roomId }) {
  const [state, formAction, pending] = useActionState(archiveRoomAction, emptyState);
  return <form action={formAction} className="om-inline-form" onSubmit={(event) => {
    if (!window.confirm("Archive this room? Its assignment history will be retained.")) event.preventDefault();
  }}>
    <input type="hidden" name="officeId" value={officeId} />
    <input type="hidden" name="roomId" value={roomId} />
    <button className="om-danger" type="submit" disabled={pending}>{pending ? "Archiving…" : "Archive room"}</button>
    <Feedback state={state} />
  </form>;
}
