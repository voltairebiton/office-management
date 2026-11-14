const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_INTEGER = 2_147_483_647;
const OPERATIONS = new Set(["consumption", "damage", "count_correction"]);
const CHANGE_EVENT = "office-management:adjustment-draft-change";
const FIELDS = ["requestKey", "locationId", "itemId", "operation", "quantity", "countedQuantity", "expectedVersion", "reason", "reference", "reversalOfMovementId"];

function storageKey(officeId) {
  return typeof officeId === "string" && UUID_PATTERN.test(officeId)
    ? "office-management:adjustment:" + officeId
    : null;
}

function normalizeDraft(draft) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return null;
  if (![draft.requestKey, draft.locationId, draft.itemId].every((value) => typeof value === "string" && UUID_PATTERN.test(value))) return null;
  if (!OPERATIONS.has(draft.operation)) return null;
  if (!FIELDS.every((field) => typeof draft[field] === "string")) return null;
  if (!draft.reason.trim() || draft.reason.trim().length > 120 || draft.reference.length > 120) return null;
  if (draft.reversalOfMovementId && !UUID_PATTERN.test(draft.reversalOfMovementId)) return null;
  if (draft.operation === "count_correction") {
    if (!/^\d{1,10}$/.test(draft.countedQuantity) || Number(draft.countedQuantity) > MAX_INTEGER) return null;
    if (!/^\d{1,10}$/.test(draft.expectedVersion) || Number(draft.expectedVersion) > MAX_INTEGER) return null;
    if (draft.quantity !== "") return null;
  } else {
    if (!/^\d{1,10}$/.test(draft.quantity) || Number(draft.quantity) < 1 || Number(draft.quantity) > MAX_INTEGER) return null;
    if (draft.countedQuantity !== "" || draft.expectedVersion !== "" || draft.reversalOfMovementId) return null;
  }
  return Object.fromEntries(FIELDS.map((field) => [field, draft[field]]));
}

export function parseAdjustmentDraft(encoded) {
  if (typeof encoded !== "string" || !encoded) return null;
  try { return normalizeDraft(JSON.parse(encoded)); } catch { return null; }
}

function notify(storage, officeId) {
  if (typeof window === "undefined") return;
  try {
    if (storage === window.localStorage) {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { officeId } }));
    }
  } catch {}
}

export function saveAdjustmentDraft(storage, officeId, draft) {
  const key = storageKey(officeId);
  const normalized = normalizeDraft(draft);
  if (!key || !normalized || !storage || typeof storage.setItem !== "function") return false;
  try { storage.setItem(key, JSON.stringify(normalized)); notify(storage, officeId); return true; } catch { return false; }
}

export function getAdjustmentDraftSnapshot(storage, officeId) {
  const key = storageKey(officeId);
  if (!key || !storage || typeof storage.getItem !== "function") return "";
  try { return storage.getItem(key) ?? ""; } catch { return ""; }
}

export function subscribeAdjustmentDraft(officeId, callback) {
  if (typeof window === "undefined") return () => {};
  const onChange = (event) => {
    if (!event.detail?.officeId || event.detail.officeId === officeId) callback();
  };
  const onStorage = (event) => {
    if (event.key === storageKey(officeId) || event.key === null) callback();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function clearAdjustmentDraft(storage, officeId) {
  const key = storageKey(officeId);
  if (!key || !storage || typeof storage.removeItem !== "function") return;
  try { storage.removeItem(key); notify(storage, officeId); } catch {}
}
