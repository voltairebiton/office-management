"use client";

import { useActionState } from "react";
import { saveWorkspaceNameAction } from "@/app/actions";

const emptyState = { ok: false, error: null, message: "" };

export function WorkspaceSettingsForm({ organizationName, canManage }) {
  const [state, formAction, pending] = useActionState(saveWorkspaceNameAction, emptyState);
  if (!canManage) return <p className="ws-settings-note">Only workspace administrators can change the organization name.</p>;
  const fieldError = state?.error?.fieldErrors?.name;
  return <form action={formAction} className="ws-settings-form">
    <input type="hidden" name="expectedName" value={organizationName} />
    <label htmlFor="workspace-name">Workspace name</label>
    <div className="ws-settings-name-row">
      <input
        id="workspace-name"
        name="name"
        defaultValue={organizationName}
        maxLength={120}
        required
        aria-invalid={fieldError ? "true" : undefined}
        aria-describedby={fieldError ? "workspace-name-error" : undefined}
      />
      <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save name"}</button>
    </div>
    {fieldError && <p id="workspace-name-error" className="ws-settings-error" role="alert">{fieldError}</p>}
    {state?.error && !fieldError && <p className="ws-settings-error" role="alert">{state.error.message}</p>}
    {state?.ok && <p className="ws-settings-success" role="status">{state.message}</p>}
  </form>;
}
