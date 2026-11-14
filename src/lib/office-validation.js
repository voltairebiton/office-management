const MAX_INTEGER = 2_147_483_647;

function inputRecord(input) {
  return input && typeof input === "object" && !Array.isArray(input) ? input : {};
}

function validationError(fieldErrors) {
  return Object.assign(new Error("Check the highlighted fields."), {
    code: "VALIDATION",
    fieldErrors,
  });
}

function normalizeName(value, field, fieldErrors) {
  if (typeof value !== "string") {
    fieldErrors[field] = "Enter a name.";
    return "";
  }

  const normalized = value.trim();
  if (!normalized) fieldErrors[field] = "Enter a name.";
  else if (normalized.length > 120) fieldErrors[field] = "Use 120 characters or fewer.";
  return normalized;
}

function normalizeCode(value, field, fieldErrors) {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(normalized)) {
    fieldErrors[field] = "Use 1–32 letters, numbers, hyphens, or underscores.";
  }
  return normalized;
}

function finish(fieldErrors, result) {
  if (Object.keys(fieldErrors).length) throw validationError(fieldErrors);
  return result;
}

export function normalizeOfficeInput(input = {}) {
  input = inputRecord(input);
  const fieldErrors = {};
  const name = normalizeName(input.name, "name", fieldErrors);
  const code = normalizeCode(input.code, "code", fieldErrors);
  const timezone =
    input.timezone === undefined || input.timezone === ""
      ? "UTC"
      : typeof input.timezone === "string"
        ? input.timezone.trim()
        : "";

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    fieldErrors.timezone = "Choose a valid time zone.";
  }

  const address = input.address == null ? "" : input.address;
  const normalizedAddress = typeof address === "string" ? address.trim() : "";
  if (typeof address !== "string") fieldErrors.address = "Enter a valid address.";
  else if (normalizedAddress.length > 240) {
    fieldErrors.address = "Use 240 characters or fewer.";
  }

  return finish(fieldErrors, {
    name,
    code,
    timezone,
    address: normalizedAddress || null,
  });
}

export function normalizeRoomInput(input = {}) {
  input = inputRecord(input);
  const fieldErrors = {};
  const name = normalizeName(input.name, "name", fieldErrors);
  const code = normalizeCode(input.code, "code", fieldErrors);
  const capacity = input.capacity == null ? null : input.capacity;

  if (
    capacity !== null &&
    (!Number.isInteger(capacity) || capacity < 0 || capacity > MAX_INTEGER)
  ) {
    fieldErrors.capacity = "Enter a whole number from 0 to 2,147,483,647.";
  }

  return finish(fieldErrors, { name, code, capacity });
}

function parseBoundedInteger(value, fallback, maximum, field, fieldErrors) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    fieldErrors[field] = `Enter a whole number from 1 to ${maximum}.`;
    return fallback;
  }
  return parsed;
}

export function parseListOptions(input = {}) {
  input = inputRecord(input);
  const fieldErrors = {};
  const page = parseBoundedInteger(input.page, 1, 100_000, "page", fieldErrors);
  const pageSize = parseBoundedInteger(input.pageSize, 20, 50, "pageSize", fieldErrors);
  const rawQuery = input.q ?? "";
  const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
  if (typeof rawQuery !== "string" || query.length > 100) {
    fieldErrors.q = "Search must be 100 characters or fewer.";
  }
  return finish(fieldErrors, {
    query,
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  });
}
