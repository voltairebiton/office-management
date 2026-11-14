import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWorkspaceName } from "../../src/lib/workspace-settings-validation.js";

test("C10-AC6 trims a valid workspace name", () => {
  assert.equal(normalizeWorkspaceName("  Manila Operations  "), "Manila Operations");
});

test("C10-AC6 rejects empty or oversized workspace names with field guidance", () => {
  assert.throws(() => normalizeWorkspaceName("  "), {
    code: "VALIDATION",
    fieldErrors: { name: "Enter a workspace name." },
  });
  assert.throws(() => normalizeWorkspaceName("x".repeat(121)), {
    code: "VALIDATION",
    fieldErrors: { name: "Use 120 characters or fewer." },
  });
});
