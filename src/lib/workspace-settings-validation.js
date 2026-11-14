const MAX_NAME_LENGTH = 120;

export function normalizeWorkspaceName(value) {
  const fieldErrors = {};
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) fieldErrors.name = "Enter a workspace name.";
  else if (name.length > MAX_NAME_LENGTH) fieldErrors.name = `Use ${MAX_NAME_LENGTH} characters or fewer.`;
  if (Object.keys(fieldErrors).length) {
    throw Object.assign(new Error("Check the highlighted fields."), {
      code: "VALIDATION",
      fieldErrors,
    });
  }
  return name;
}
