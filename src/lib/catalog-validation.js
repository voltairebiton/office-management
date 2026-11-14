function validationError(fieldErrors) {
  return Object.assign(new Error("Check the highlighted fields."), {
    code: "VALIDATION",
    fieldErrors,
  });
}

function inputRecord(input) {
  return input && typeof input === "object" && !Array.isArray(input) ? input : {};
}

function finish(fieldErrors, values) {
  if (Object.keys(fieldErrors).length) throw validationError(fieldErrors);
  return values;
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

export function normalizeCatalogItemInput(input = {}) {
  input = inputRecord(input);
  const fieldErrors = {};
  const sku = normalizeCode(input.sku, "sku", fieldErrors);
  const name = normalizeName(input.name, "name", fieldErrors);
  const category = input.category;
  if (!new Set(["consumable", "reusable"]).has(category)) {
    fieldErrors.category = "Choose consumable or reusable.";
  }
  const unit = typeof input.unit === "string" ? input.unit.trim().toLowerCase() : "";
  if (!/^[a-z][a-z0-9_-]{0,23}$/.test(unit)) {
    fieldErrors.unit = "Enter one unit label using 1–24 letters, numbers, hyphens, or underscores.";
  }
  return finish(fieldErrors, { sku, name, category, unit });
}

export function normalizeStorageLocationInput(input = {}) {
  input = inputRecord(input);
  const fieldErrors = {};
  const code = normalizeCode(input.code, "code", fieldErrors);
  const name = normalizeName(input.name, "name", fieldErrors);
  return finish(fieldErrors, { code, name });
}
