import assert from "node:assert/strict";
import test from "node:test";
import { canAccessWorkspaceView, visibleNavigation } from "../../src/lib/workspace-navigation.js";

test("C10-AC4 filters staff navigation by capability and gives employees their own assignments", () => {
  const employeeNavigation = visibleNavigation(["assignments:read:self"]);
  const employeeViews = employeeNavigation.flatMap((group) => group.items.map((item) => item.id));
  assert.ok(employeeViews.includes("people"));
  assert.ok(employeeViews.includes("settings"));
  assert.ok(!employeeViews.includes("overview"));
  assert.ok(!employeeViews.includes("inventory"));
  assert.ok(!employeeViews.includes("offices"));
  assert.equal(canAccessWorkspaceView("inventory", ["assignments:read:self"]), false);
  assert.equal(canAccessWorkspaceView("people", ["assignments:read:self"]), true);
});

test("C10-AC4 retains the public preview navigation independently of staff permissions", () => {
  const previewViews = visibleNavigation([], true).flatMap((group) => group.items.map((item) => item.id));
  assert.ok(previewViews.includes("inventory"));
  assert.ok(previewViews.includes("refreshments"));
  assert.ok(previewViews.includes("visitors"));
});
