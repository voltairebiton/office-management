const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANGE_EVENT = "office-management:transfer-draft-change";

function storageKey(officeId) {
  return typeof officeId === "string" && UUID_PATTERN.test(officeId)
    ? `office-management:transfer:${officeId}`
    : null;
}

function normalizeDraft(draft) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return null;
  const validIds = [draft.requestKey, draft.sourceLocationId, draft.destinationLocationId, draft.itemId]
    .every((value) => typeof value === "string" && UUID_PATTERN.test(value));
  if (!validIds || draft.sourceLocationId === draft.destinationLocationId) return null;
  if (typeof draft.quantity !== "string" || !/^\d{1,10}$/.test(draft.quantity)) return null;
  if (!new Set(["deployment", "return", "transfer"]).has(draft.intent)) return null;
  if (typeof draft.reference !== "string" || draft.reference.length > 120) return null;
  return {
    requestKey: draft.requestKey,
    sourceLocationId: draft.sourceLocationId,
    destinationLocationId: draft.destinationLocationId,
    itemId: draft.itemId,
    quantity: draft.quantity,
    intent: draft.intent,
    reference: draft.reference,
  };
}

export function parseTransferDraft(encoded) {
  if (typeof encoded !== "string" || !encoded) return null;
  try { return normalizeDraft(JSON.parse(encoded)); } catch { return null; }
}

export function getTransferDraftSnapshot(storage, officeId) {
  const key = storageKey(officeId);
  if (!key || !storage || typeof storage.getItem !== "function") return "";
  try { return storage.getItem(key) ?? ""; } catch { return ""; }
}

export function subscribeTransferDraft(officeId, callback) {
  if (typeof window === "undefined") return () => {};
  const onDraftChange = (event) => {
    if (!event.detail?.officeId || event.detail.officeId === officeId) callback();
  };
  const onStorage = (event) => {
    if (event.key === storageKey(officeId) || event.key === null) callback();
  };
  window.addEventListener(CHANGE_EVENT, onDraftChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onDraftChange);
    window.removeEventListener("storage", onStorage);
  };
}

function notifyDraftChange(storage, officeId) {
  if (typeof window === "undefined") return;
  try {
    if (storage === window.localStorage) {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { officeId } }));
    }
  } catch {}
}

export function saveTransferDraft(storage, officeId, draft) {
  const key = storageKey(officeId);
  const normalized = normalizeDraft(draft);
  if (!key || !normalized || !storage || typeof storage.setItem !== "function") return false;
  try {
    storage.setItem(key, JSON.stringify(normalized));
    notifyDraftChange(storage, officeId);
    return true;
  } catch {
    return false;
  }
}

export function clearTransferDraft(storage, officeId) {
  const key = storageKey(officeId);
  if (!key || !storage || typeof storage.removeItem !== "function") return;
  try { storage.removeItem(key); notifyDraftChange(storage, officeId); } catch {}
}
