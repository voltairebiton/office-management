"use server";

import { signOut } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { getAuthConfiguration } from "@/lib/auth-config";
import { revalidatePath } from "next/cache";
import { requireOrganization } from "@/lib/auth";
import {
  archiveOffice,
  archiveRoom,
  createOffice,
  createRoom,
  updateOffice,
  updateRoom,
} from "@/lib/office-service";
import {
  assignMemberToRoom,
  endRoomAssignment,
  grantOfficeAccess,
  revokeOfficeAccess,
} from "@/lib/people-service";

function value(formData, field) {
  const entry = formData.get(field);
  return typeof entry === "string" ? entry : "";
}

function actionError(error) {
  const code = ["VALIDATION", "CONFLICT", "NOT_FOUND", "FORBIDDEN", "DEPENDENCY_UNAVAILABLE"].includes(error?.code)
    ? error.code
    : "DEPENDENCY_UNAVAILABLE";
  return {
    ok: false,
    error: {
      code,
      message: code === "DEPENDENCY_UNAVAILABLE" ? "We couldn’t save this change. Try again shortly." : error.message,
      fieldErrors: error?.fieldErrors ?? {},
      dependents: error?.dependents ?? {},
    },
  };
}

function officeInput(formData) {
  return {
    name: value(formData, "name"),
    code: value(formData, "code"),
    timezone: value(formData, "timezone"),
    address: value(formData, "address"),
  };
}

function roomInput(formData) {
  const capacity = value(formData, "capacity");
  return {
    name: value(formData, "name"),
    code: value(formData, "code"),
    capacity: capacity === "" ? null : /^\d+$/.test(capacity) ? Number(capacity) : capacity,
  };
}

async function submitOffice(formData, operation) {
  const { authorization } = await requireOrganization();
  try {
    const officeId = value(formData, "officeId");
    if (operation === "create") await createOffice(authorization, officeInput(formData));
    else await updateOffice(authorization, officeId, officeInput(formData), value(formData, "expectedUpdatedAt"));
    revalidatePath("/dashboard");
    return { ok: true, message: operation === "create" ? "Office created." : "Office updated." };
  } catch (error) {
    return actionError(error);
  }
}

async function submitRoom(formData, operation) {
  const { authorization } = await requireOrganization();
  try {
    const officeId = value(formData, "officeId");
    const roomId = value(formData, "roomId");
    if (operation === "create") await createRoom(authorization, officeId, roomInput(formData));
    else await updateRoom(authorization, officeId, roomId, roomInput(formData), value(formData, "expectedUpdatedAt"));
    revalidatePath("/dashboard");
    return { ok: true, message: operation === "create" ? "Room created." : "Room updated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function signOutAction() {
  if (!getAuthConfiguration().ready) redirect("/");
  await signOut();
}

export async function saveOfficeAction(previousState, formData) {
  return submitOffice(formData, value(formData, "officeId") ? "update" : "create");
}

export async function archiveOfficeAction(previousState, formData) {
  const { authorization } = await requireOrganization();
  try {
    await archiveOffice(authorization, value(formData, "officeId"));
    revalidatePath("/dashboard");
    return { ok: true, message: "Office archived." };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveRoomAction(previousState, formData) {
  return submitRoom(formData, value(formData, "roomId") ? "update" : "create");
}

export async function archiveRoomAction(previousState, formData) {
  const { authorization } = await requireOrganization();
  try {
    await archiveRoom(
      authorization,
      value(formData, "officeId"),
      value(formData, "roomId"),
    );
    revalidatePath("/dashboard");
    return { ok: true, message: "Room archived." };
  } catch (error) {
    return actionError(error);
  }
}

export async function manageOfficeAccessAction(previousState, formData) {
  const { authorization } = await requireOrganization();
  const operation = value(formData, "operation");
  try {
    if (operation === "grant") {
      await grantOfficeAccess(
        authorization,
        value(formData, "membershipId"),
        value(formData, "officeId"),
      );
    } else if (operation === "revoke") {
      await revokeOfficeAccess(
        authorization,
        value(formData, "membershipId"),
        value(formData, "officeId"),
      );
    } else {
      return actionError(Object.assign(new Error("Choose an access change."), { code: "VALIDATION" }));
    }
    revalidatePath("/dashboard");
    return { ok: true, message: operation === "grant" ? "Office access granted." : "Office access removed." };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveRoomAssignmentAction(previousState, formData) {
  const { authorization } = await requireOrganization();
  const officeId = value(formData, "officeId");
  const membershipId = value(formData, "membershipId");
  const expectedAssignmentId = value(formData, "expectedAssignmentId") || null;
  const roomId = value(formData, "roomId");
  try {
    if (roomId) {
      await assignMemberToRoom(
        authorization,
        officeId,
        membershipId,
        roomId,
        { expectedAssignmentId },
      );
    } else if (expectedAssignmentId) {
      await endRoomAssignment(
        authorization,
        officeId,
        membershipId,
        { expectedAssignmentId },
      );
    }
    revalidatePath("/dashboard");
    return { ok: true, message: roomId ? "Room assignment saved." : "Room assignment ended." };
  } catch (error) {
    return actionError(error);
  }
}
