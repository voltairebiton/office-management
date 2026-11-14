import assert from "node:assert/strict";
import test from "node:test";
import { isSafeRequestReference, reportOperationFailure } from "../../src/lib/diagnostics.js";

test("C11-AC7 logs a safe request ID, static operation, and stable code only", () => {
  const entries = [];
  const error = Object.assign(new Error("postgres://private:secret@host/database"), {
    code: "DEPENDENCY_UNAVAILABLE",
  });
  const requestId = reportOperationFailure("stock.receipt", error, {
    logger: (...entry) => entries.push(entry),
    createId: () => "request-safe-1",
  });
  assert.equal(requestId, "request-safe-1");
  assert.deepEqual(entries, [["Workspace operation failed", {
    requestId: "request-safe-1",
    operation: "stock.receipt",
    code: "DEPENDENCY_UNAVAILABLE",
  }]]);
  assert.doesNotMatch(JSON.stringify(entries), /private|secret|host|database/);
});

test("C11-AC7 does not log expected validation or authorization outcomes", () => {
  const entries = [];
  const requestId = reportOperationFailure("office.save", { code: "VALIDATION" }, {
    logger: (...entry) => entries.push(entry),
    createId: () => "unused",
  });
  assert.equal(requestId, null);
  assert.deepEqual(entries, []);
});

test("C11-AC7 classifies identity-provider failures and never lets logging break the response", () => {
  const entries = [];
  const requestId = reportOperationFailure("workspace.name.update", {
    code: "IDENTITY_PROVIDER_UNAVAILABLE",
    message: "provider secret detail",
  }, {
    logger: (...entry) => entries.push(entry),
    createId: () => "request-provider-1",
  });
  assert.equal(requestId, "request-provider-1");
  assert.equal(entries[0][1].code, "DEPENDENCY_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(entries), /provider secret detail/);

  assert.equal(reportOperationFailure("workspace.failure", new Error("private"), {
    logger() { throw new Error("logger unavailable"); },
    createId: () => "request-logger-failure",
  }), "request-logger-failure");
});

test("C11-AC7 suppresses expected identity denials and validates displayed request references", () => {
  const entries = [];
  const requestId = reportOperationFailure("identity.workspace.verify", {
    code: "IDENTITY_MEMBERSHIP_MISMATCH",
  }, {
    logger: (...entry) => entries.push(entry),
    createId: () => "unused",
  });
  assert.equal(requestId, null);
  assert.deepEqual(entries, []);
  assert.equal(isSafeRequestReference("c5f14d4a-1a2b-4c3d-8e9f-0123456789ab"), true);
  assert.equal(isSafeRequestReference("http://private.example?token=secret"), false);
  assert.equal(isSafeRequestReference(""), false);
});
