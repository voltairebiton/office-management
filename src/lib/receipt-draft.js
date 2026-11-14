const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DRAFT_FIELDS = ["requestKey", "itemId", "locationId", "quantity", "reason", "reference"];
const CHANGE_EVENT = "office-management:receipt-draft-change";

function storageKey(officeId) {
  return typeof officeId === "string" && UUID_PATTERN.test(officeId)
    ? `office-management:receipt:${officeId}`
    : null;
}

function normalizeDraft(draft) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return null;
  if (!UUID_PATTERN.test(draft.requestKey ?? "") || !UUID_PATTERN.test(draft.itemId ?? "") || !UUID_PATTERN.test(draft.locationId ?? "")) return null;
  if (typeof draft.quantity !== "string" || !/^\d{1,10}$/.test(draft.quantity)) return null;
  if (!new Set(["opening", "replenishment"]).has(draft.reason)) return null;
  if (typeof draft.reference !== "string" || draft.reference.length > 120) return null;
  return Object.fromEntries(DRAFT_FIELDS.map((field) => [field, draft[field]]));
}

export function parseReceiptDraft(encoded) {
  if (typeof encoded !== "string" || !encoded) return null;
  try { return normalizeDraft(JSON.parse(encoded)); } catch { return null; }
}

export function getReceiptDraftSnapshot(storage, officeId) {
  const key = storageKey(officeId);
  if (!key || !storage || typeof storage.getItem !== "function") return "";
  try { return storage.getItem(key) ?? ""; } catch { return ""; }
}

export function subscribeReceiptDraft(officeId, callback) {
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

export function saveReceiptDraft(storage, officeId, draft) {
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

export function readReceiptDraft(storage, officeId) {
  const key = storageKey(officeId);
  if (!key || !storage || typeof storage.getItem !== "function") return null;
  try {
    const encoded = storage.getItem(key);
    if (encoded === null) return null;
    const normalized = normalizeDraft(JSON.parse(encoded));
    if (normalized) return normalized;
    storage.removeItem?.(key);
    notifyDraftChange(storage, officeId);
    return null;
  } catch {
    try { storage.removeItem?.(key); } catch {}
    notifyDraftChange(storage, officeId);
    return null;
  }
}

export function clearReceiptDraft(storage, officeId) {
  const key = storageKey(officeId);
  if (!key || !storage || typeof storage.removeItem !== "function") return;
  try { storage.removeItem(key); notifyDraftChange(storage, officeId); } catch {}
}
