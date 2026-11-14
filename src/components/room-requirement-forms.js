"use client";

import { useActionState } from "react";
import { removeRoomRequirementAction, saveRoomRequirementAction } from "@/app/actions";

const initialState = { ok: null, message: "", error: null };

function ActionMessage({ state }) {
  if (state?.error) return <p className="om-feedback is-error" role="alert">{state.error.message}</p>;
  if (!state?.message) return null;
  return <p className={state.ok ? "om-feedback is-success" : "om-feedback is-error"} role="status">{state.message}</p>;
}

export function CreateRoomRequirementForm({ officeId, rooms, items }) {
  const [state, formAction, pending] = useActionState(saveRoomRequirementAction, initialState);
  const fieldErrors = state?.error?.fieldErrors ?? {};
  return <form action={formAction} className="om-form pm-catalog-form pm-room-target-form">
    <input type="hidden" name="officeId" value={officeId} />
    <input type="hidden" name="expectedVersion" value="0" />
    <div className="om-form-grid">
      <label className="om-field"><span>Room *</span>
        <select name="roomId" defaultValue="" required disabled={pending || !rooms.length} aria-invalid={Boolean(fieldErrors.roomId)}>
          <option value="">Choose an active room</option>
          {rooms.map((room) => <option key={room.id} value={room.id}>{room.code} · {room.name}</option>)}
        </select>
        {fieldErrors.roomId && <small className="om-field-error">{fieldErrors.roomId}</small>}
      </label>
      <label className="om-field"><span>Item *</span>
        <select name="itemId" defaultValue="" required disabled={pending || !items.length} aria-invalid={Boolean(fieldErrors.itemId)}>
          <option value="">Choose an active item</option>
          {items.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name} ({item.unit})</option>)}
        </select>
        {fieldErrors.itemId && <small className="om-field-error">{fieldErrors.itemId}</small>}
      </label>
      <label className="om-field"><span>Target quantity *</span>
        <input type="number" name="targetQuantity" min="0" max="2147483647" step="1" inputMode="numeric" defaultValue="0" required disabled={pending} aria-invalid={Boolean(fieldErrors.targetQuantity)} />
        {fieldErrors.targetQuantity && <small className="om-field-error">{fieldErrors.targetQuantity}</small>}
      </label>
    </div>
    <div className="om-form-actions"><button className="om-primary" type="submit" disabled={pending || !rooms.length || !items.length}>{pending ? "Saving target…" : "Add room target"}</button><ActionMessage state={state} /></div>
    {!rooms.length && <p className="pm-muted">Add an active room before setting a target.</p>}
    {!items.length && <p className="pm-muted">Add an active catalog item before setting a target.</p>}
  </form>;
}

export function RoomRequirementTargetForm({ officeId, row }) {
  const [state, formAction, pending] = useActionState(saveRoomRequirementAction, initialState);
  const fieldErrors = state?.error?.fieldErrors ?? {};
  return <form action={formAction} className="pm-room-target-inline">
    <input type="hidden" name="officeId" value={officeId} />
    <input type="hidden" name="roomId" value={row.roomId} />
    <input type="hidden" name="itemId" value={row.itemId} />
    <input type="hidden" name="expectedVersion" value={row.requirementVersion ?? 0} />
    <label className="ws-sr-only" htmlFor={"room-target-" + row.roomId + "-" + row.itemId}>Target quantity for {row.roomName}, {row.itemName}</label>
    <input id={"room-target-" + row.roomId + "-" + row.itemId} type="number" name="targetQuantity" min="0" max="2147483647" step="1" inputMode="numeric" defaultValue={row.targetQuantity ?? 0} required disabled={pending} aria-invalid={Boolean(fieldErrors.targetQuantity)} />
    <button type="submit" disabled={pending}>{row.requirementId ? "Save" : "Set target"}</button>
    {fieldErrors.targetQuantity && <small className="om-field-error">{fieldErrors.targetQuantity}</small>}
    <ActionMessage state={state} />
  </form>;
}

export function RemoveRoomRequirementForm({ officeId, row }) {
  const [state, formAction, pending] = useActionState(removeRoomRequirementAction, initialState);
  return <form action={formAction} className="pm-room-target-remove">
    <input type="hidden" name="officeId" value={officeId} />
    <input type="hidden" name="requirementId" value={row.requirementId} />
    <input type="hidden" name="expectedVersion" value={row.requirementVersion} />
    <button type="submit" className="om-tertiary" disabled={pending}>{pending ? "Removing…" : "Remove target"}</button>
    <ActionMessage state={state} />
  </form>;
}
