const MAX_INTEGER = 2_147_483_647;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOM_NEED_STATUSES = new Set(["all", "shortage", "on_target", "surplus", "untracked"]);

function inputRecord(input) {
  return input && typeof input === "object" && !Array.isArray(input) ? input : {};
}

function validationError(fieldErrors) {
  return Object.assign(new Error("Check the highlighted fields."), { code: "VALIDATION", fieldErrors });
}

function parseWholeNumber(value, { field, minimum = 0, maximum = MAX_INTEGER, message, fieldErrors }) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    fieldErrors[field] = message;
    return null;
  }
  return parsed;
}

export function calculateRoomNeed(target, deployed) {
  if (target !== null && (!Number.isSafeInteger(target) || target < 0 || target > MAX_INTEGER)) {
    throw new RangeError("Target must be a nonnegative whole unit quantity.");
  }
  if (!Number.isSafeInteger(deployed) || deployed < 0 || deployed > MAX_INTEGER) {
    throw new RangeError("Deployed stock must be a nonnegative whole unit quantity.");
  }
  if (target === null) {
    return { target: null, deployed, shortage: 0, surplus: deployed, status: "untracked" };
  }
  return {
    target,
    deployed,
    shortage: Math.max(target - deployed, 0),
    surplus: Math.max(deployed - target, 0),
    status: target > deployed ? "shortage" : deployed > target ? "surplus" : "on_target",
  };
}

export function normalizeRoomRequirementInput(input = {}) {
  input = inputRecord(input);
  const fieldErrors = {};
  const ids = {};
  for (const field of ["officeId", "roomId", "itemId"]) {
    ids[field] = typeof input[field] === "string" ? input[field].toLowerCase() : "";
    if (!UUID_PATTERN.test(ids[field])) fieldErrors[field] = "Choose a valid office, room, and item.";
  }
  const targetQuantity = parseWholeNumber(input.targetQuantity, {
    field: "targetQuantity",
    message: "Enter a whole target from 0 to 2,147,483,647.",
    fieldErrors,
  });
  const expectedVersion = parseWholeNumber(input.expectedVersion, {
    field: "expectedVersion",
    message: "Reload this room requirement before saving.",
    fieldErrors,
  });
  if (Object.keys(fieldErrors).length) throw validationError(fieldErrors);
  return { ...ids, targetQuantity, expectedVersion };
}

export function normalizeRoomNeedsQuery(input = {}) {
  input = inputRecord(input);
  const fieldErrors = {};
  const page = parseWholeNumber(input.page ?? 1, {
    field: "page",
    minimum: 1,
    maximum: 100_000,
    message: "Choose a valid page.",
    fieldErrors,
  });
  const pageSize = parseWholeNumber(input.pageSize ?? 20, {
    field: "pageSize",
    minimum: 1,
    maximum: 50,
    message: "Choose a page size from 1 to 50.",
    fieldErrors,
  });
  const status = input.status ?? "all";
  if (typeof status !== "string" || !ROOM_NEED_STATUSES.has(status)) {
    fieldErrors.status = "Choose a valid room inventory status.";
  }
  const ids = {};
  for (const field of ["officeId", "roomId", "itemId"]) {
    const value = input[field] ?? "";
    if (value !== "" && (typeof value !== "string" || !UUID_PATTERN.test(value))) {
      fieldErrors[field] = "Choose a valid filter.";
      ids[field] = null;
    } else ids[field] = value ? value.toLowerCase() : null;
  }
  const rawQuery = input.q ?? "";
  const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
  if (typeof rawQuery !== "string" || query.length > 100) fieldErrors.q = "Search must be 100 characters or fewer.";
  if (Object.keys(fieldErrors).length) throw validationError(fieldErrors);
  return { page, pageSize, offset: (page - 1) * pageSize, status, ...ids, query };
}
