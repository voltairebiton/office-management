import assert from "node:assert/strict";
import test from "node:test";
import { buildAuthorizationContext } from "../../src/lib/authorization.js";
import { buildAuditRecord } from "../../src/lib/audit.js";

function adminContext() {
  return buildAuthorizationContext({
    actor: { id: "user-a" },
    organization: { id: "tenant-a", isActive: true },
    membership: {
      id: "membership-a",
      userId: "user-a",
      organizationId: "tenant-a",
      status: "active",
      role: "organization_admin",
    },
    offices: [{ id: "office-a", organizationId: "tenant-a", isActive: true }],
  });
}

test("C02-AC7 audit event validation", async (t) => {
  await t.test("builds actor and tenant fields from the server authorization context", () => {
    assert.deepEqual(
      buildAuditRecord(adminContext(), {
        operation: "office.created",
        resourceType: "office",
        resourceId: "office-a",
        officeId: "office-a",
        requestId: "request-a",
        before: null,
        after: { name: "North office", code: "NORTH" },
        actorUserId: "attacker-user",
        organizationId: "tenant-b",
      }),
      {
        organizationId: "tenant-a",
        actorUserId: "user-a",
        actorMembershipId: "membership-a",
        officeId: "office-a",
        operation: "office.created",
        resourceType: "office",
        resourceId: "office-a",
        requestId: "request-a",
        before: null,
        after: { name: "North office", code: "NORTH" },
      },
    );
  });

  await t.test("rejects an office outside the actor's active scope", () => {
    assert.throws(
      () => buildAuditRecord(adminContext(), {
        operation: "room.updated",
        resourceType: "room",
        resourceId: "room-b",
        officeId: "office-not-assigned",
      }),
      { code: "NOT_FOUND", message: "The requested resource was not found." },
    );
  });

  await t.test("rejects secrets and personal contact fields from snapshots", () => {
    for (const after of [
      { email: "ada@example.invalid" },
      { authToken: "token-value" },
      { nested: { sessionCookie: "cookie-value" } },
    ]) {
      assert.throws(
        () => buildAuditRecord(adminContext(), {
          operation: "member.updated",
          resourceType: "membership",
          resourceId: "membership-a",
          after,
        }),
        { code: "AUDIT_DATA_INVALID" },
      );
    }
  });

  await t.test("rejects inactive contexts, invalid identifiers, circular and oversized snapshots", () => {
    const inactive = buildAuthorizationContext({
      actor: { id: "user-a" },
      organization: { id: "tenant-a", isActive: false },
      membership: { id: "membership-a", userId: "user-a", organizationId: "tenant-a", status: "active", role: "organization_admin" },
    });
    assert.throws(
      () => buildAuditRecord(inactive, {
        operation: "office.created",
        resourceType: "office",
        resourceId: "office-a",
      }),
      { code: "FORBIDDEN" },
    );
    assert.throws(
      () => buildAuditRecord(adminContext(), {
        operation: "../../sql",
        resourceType: "office",
        resourceId: "office-a",
      }),
      { code: "AUDIT_DATA_INVALID" },
    );
    const circular = {}; circular.self = circular;
    assert.throws(
      () => buildAuditRecord(adminContext(), {
        operation: "office.updated",
        resourceType: "office",
        resourceId: "office-a",
        after: circular,
      }),
      { code: "AUDIT_DATA_INVALID" },
    );
    assert.throws(
      () => buildAuditRecord(adminContext(), {
        operation: "office.updated",
        resourceType: "office",
        resourceId: "office-a",
        after: { description: "x".repeat(9000) },
      }),
      { code: "AUDIT_DATA_INVALID" },
    );
  });
});
