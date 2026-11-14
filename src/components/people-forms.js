"use client";

import { useActionState } from "react";
import { manageOfficeAccessAction, saveRoomAssignmentAction } from "@/app/actions";

const initialState = { ok: false, error: null, message: "" };

function Message({ state }) {
  if (state?.ok) return <span className="pm-message is-success" role="status">{state.message}</span>;
  if (state?.error) return <span className="pm-message is-error" role="alert">{state.error.message}</span>;
  return null;
}

export function OfficeAccessGrantForm({ membershipId, offices }) {
  const [state, formAction, pending] = useActionState(manageOfficeAccessAction, initialState);
  if (!offices.length) return null;
  return <form action={formAction} className="pm-access-form">
    <input type="hidden" name="operation" value="grant" />
    <input type="hidden" name="membershipId" value={membershipId} />
    <label className="pm-sr-only" htmlFor={`grant-office-${membershipId}`}>Grant office access</label>
    <select id={`grant-office-${membershipId}`} name="officeId" defaultValue="" required>
      <option value="" disabled>Grant office access…</option>
      {offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
    </select>
    <button type="submit" disabled={pending}>{pending ? "Saving…" : "Grant"}</button>
    <Message state={state} />
  </form>;
}

export function OfficeAccessRevokeForm({ membershipId, officeId, officeName }) {
  const [state, formAction, pending] = useActionState(manageOfficeAccessAction, initialState);
  return <form action={formAction} className="pm-access-revoke">
    <input type="hidden" name="operation" value="revoke" />
    <input type="hidden" name="membershipId" value={membershipId} />
    <input type="hidden" name="officeId" value={officeId} />
    <span>{officeName}</span>
    <button type="submit" disabled={pending} aria-label={`Remove ${officeName} access`}>{pending ? "Removing…" : "Remove"}</button>
    <Message state={state} />
  </form>;
}

export function RoomAssignmentForm({ officeId, member, rooms, counts }) {
  const [state, formAction, pending] = useActionState(saveRoomAssignmentAction, initialState);
  const current = member.assignmentId ? member : null;
  const assignedCount = current?.roomId ? counts.find((row) => row.roomId === current.roomId)?.assignedCount ?? 0 : 0;
  const currentCapacity = current?.roomId ? counts.find((row) => row.roomId === current.roomId)?.capacity : null;
  return <form action={formAction} className="pm-assignment-form">
    <input type="hidden" name="officeId" value={officeId} />
    <input type="hidden" name="membershipId" value={member.membershipId} />
    <input type="hidden" name="expectedAssignmentId" value={member.assignmentId ?? ""} />
    <label className="pm-assignment-label" htmlFor={`room-${member.membershipId}`}>
      <span>Assigned room for {member.displayName || member.email}</span>
      {currentCapacity !== null && <small>{assignedCount} assigned · capacity {currentCapacity}{assignedCount > currentCapacity ? " · over capacity" : ""}</small>}
    </label>
    <div className="pm-assignment-controls">
      <select id={`room-${member.membershipId}`} name="roomId" defaultValue={member.roomId ?? ""}>
        <option value="">Not assigned</option>
        {rooms.map((room) => <option key={room.id} value={room.id}>{room.name} · {room.code}{room.capacity === null ? "" : ` · capacity ${room.capacity}`}</option>)}
      </select>
      <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    </div>
    {state?.error && <p className="pm-message is-error" role="alert">{state.error.message}</p>}
    {state?.ok && <p className="pm-message is-success" role="status">{state.message}</p>}
  </form>;
}
