"use server";

import { randomUUID } from "node:crypto";
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
import {
  archiveItem,
  archiveLocation,
  createCatalogItem,
  createStorageLocation,
  ensureRoomLocation,
  updateCatalogItem,
  updateStorageLocation,
} from "@/lib/catalog-service";
import { receiveStock } from "@/lib/stock-service";
import { transferStock } from "@/lib/transfer-service";

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

function catalogItemInput(formData) {
  return {
    sku: value(formData, "sku"),
    name: value(formData, "name"),
    category: value(formData, "category"),
    unit: value(formData, "unit"),
  };
}

function storageLocationInput(formData) {
  return {
    code: value(formData, "code"),
    name: value(formData, "name"),
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

export async function saveCatalogItemAction(previousState, formData) {
  const { authorization } = await requireOrganization();
  const itemId = value(formData, "itemId");
  try {
    if (itemId) {
      await updateCatalogItem(authorization, itemId, catalogItemInput(formData), value(formData, "expectedUpdatedAt"));
    } else {
      await createCatalogItem(authorization, catalogItemInput(formData));
    }
    revalidatePath("/dashboard");
    return { ok: true, message: itemId ? "Catalog item updated." : "Catalog item created." };
  } catch (error) {
    return actionError(error);
  }
}

export async function archiveCatalogItemAction(previousState, formData) {
  const { authorization } = await requireOrganization();
  try {
    await archiveItem(authorization, value(formData, "itemId"));
    revalidatePath("/dashboard");
    return { ok: true, message: "Catalog item archived." };
  } catch (error) {
    return actionError(error);
  }
}

export async function saveStorageLocationAction(previousState, formData) {
  const { authorization } = await requireOrganization();
  const officeId = value(formData, "officeId");
  const locationId = value(formData, "locationId");
  try {
    if (locationId) {
      await updateStorageLocation(
        authorization,
        officeId,
        locationId,
        storageLocationInput(formData),
        value(formData, "expectedUpdatedAt"),
      );
    } else {
      await createStorageLocation(authorization, officeId, storageLocationInput(formData));
    }
    revalidatePath("/dashboard");
    return { ok: true, message: locationId ? "Stock location updated." : "Storage location created." };
  } catch (error) {
    return actionError(error);
  }
}

export async function archiveStockLocationAction(previousState, formData) {
  const { authorization } = await requireOrganization();
  try {
    await archiveLocation(
      authorization,
      value(formData, "officeId"),
      value(formData, "locationId"),
    );
    revalidatePath("/dashboard");
    return { ok: true, message: "Stock location archived." };
  } catch (error) {
    return actionError(error);
  }
}

export async function ensureRoomStockLocationAction(previousState, formData) {
  const { authorization } = await requireOrganization();
  try {
    await ensureRoomLocation(
      authorization,
      value(formData, "officeId"),
      value(formData, "roomId"),
    );
    revalidatePath("/dashboard");
    return { ok: true, message: "Room stock location is ready." };
  } catch (error) {
    return actionError(error);
  }
}

export async function receiveStockAction(previousState, formData) {
  const { authorization } = await requireOrganization();
  try {
    const result = await receiveStock(authorization, {
      officeId: value(formData, "officeId"),
      locationId: value(formData, "locationId"),
      itemId: value(formData, "itemId"),
      requestKey: value(formData, "requestKey"),
      quantity: value(formData, "quantity"),
      reason: value(formData, "reason"),
      reference: value(formData, "reference"),
    });
    revalidatePath("/dashboard");
    return {
      ok: true,
      message: `${result.movement.quantityDelta} ${result.movement.itemUnit} of ${result.movement.itemName} received. Balance: ${result.balanceAfter}.`,
      transactionId: result.transactionId,
      movementId: result.movement.id,
      nextRequestKey: randomUUID(),
    };
  } catch (error) {
    return actionError(error);
  }
}

export async function transferStockAction(previousState, formData) {
  const { authorization } = await requireOrganization();
  try {
    const result = await transferStock(authorization, {
      officeId: value(formData, "officeId"),
      sourceLocationId: value(formData, "sourceLocationId"),
      destinationLocationId: value(formData, "destinationLocationId"),
      itemId: value(formData, "itemId"),
      requestKey: value(formData, "requestKey"),
      quantity: value(formData, "quantity"),
      intent: value(formData, "intent"),
      reference: value(formData, "reference"),
    });
    revalidatePath("/dashboard");
    const unit = result.outgoing.itemUnit;
    const name = result.outgoing.itemName;
    const verb = { deployment: "deployed", return: "returned", transfer: "transferred" }[result.outgoing.reason];
    return {
      ok: true,
      message: `${result.outgoing.quantityDelta * -1} ${unit} of ${name} ${verb}. Source balance: ${result.sourceBalanceAfter}; destination balance: ${result.destinationBalanceAfter}.`,
      transactionId: result.transactionId,
      nextRequestKey: randomUUID(),
    };
  } catch (error) {
    return actionError(error);
  }
}
