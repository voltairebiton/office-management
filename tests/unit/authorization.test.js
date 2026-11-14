import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCapability,
  buildAuthorizationContext,
  hasCapability,
} from "../../src/lib/authorization.js";

function makeContext(role, overrides = {}) {
  const organization = { id: "tenant-a", isActive: true };
  const membership = {
    id: "membership-a",
    organizationId: "tenant-a",
    userId: "user-a",
    role,
    status: "active",
  };
  const offices = [
    { id: "office-a", organizationId: "tenant-a", isActive: true },
    { id: "office-b", organizationId: "tenant-a", isActive: true },
    { id: "office-archived", organizationId: "tenant-a", isActive: false },
    { id: "office-foreign", organizationId: "tenant-b", isActive: true },
  ];
  const officeAssignments = [
    { organizationId: "tenant-a", officeId: "office-a", membershipId: "membership-a", isActive: true },
    { organizationId: "tenant-a", officeId: "office-archived", membershipId: "membership-a", isActive: true },
    { organizationId: "tenant-a", officeId: "office-b", membershipId: "membership-a", isActive: false },
    { organizationId: "tenant-b", officeId: "office-foreign", membershipId: "membership-a", isActive: true },
  ];
  return buildAuthorizationContext({
    actor: { id: "user-a" },
    organization,
    membership,
    offices,
    officeAssignments,
    ...overrides,
  });
}

test("C02-AC1 authorization context", async (t) => {
  await t.test("organization admin receives tenant-wide capabilities and active office scope", () => {
    const context = makeContext("organization_admin");
    assert.equal(hasCapability(context, "offices:manage"), true);
    assert.equal(hasCapability(context, "inventory:manage"), true);
    assert.deepEqual(context.officeIds, ["office-a", "office-b"]);
  });

  await t.test("office manager is scoped to assigned active offices without tenant grants", () => {
    const context = makeContext("office_manager");
    assert.equal(hasCapability(context, "rooms:manage"), true);
    assert.equal(hasCapability(context, "inventory:manage"), true);
    assert.equal(hasCapability(context, "members:manage"), false);
    assert.equal(hasCapability(context, "office-access:manage"), false);
    assert.deepEqual(context.officeIds, ["office-a"]);
  });

  await t.test("combines explicit persisted capabilities and ignores unknown grants", () => {
    const context = makeContext("office_manager", {
      membership: {
        id: "membership-a",
        organizationId: "tenant-a",
        userId: "user-a",
        role: "office_manager",
        status: "active",
        grantedCapabilities: ["members:read", "root:all", "inventory:manage"],
      },
    });
    assert.equal(hasCapability(context, "members:read"), true);
    assert.equal(context.capabilities.includes("root:all"), false);
    assert.equal(context.capabilities.filter((capability) => capability === "inventory:manage").length, 1);
  });

  await t.test("employee and helper roles can read only their own assignments", () => {
    for (const role of ["employee", "office_helper", "reception", "security"]) {
      const context = makeContext(role);
      assert.equal(hasCapability(context, "assignments:read:self"), true);
      assert.equal(hasCapability(context, "members:read"), false);
      assert.equal(hasCapability(context, "inventory:manage"), false);
    }
  });

  await t.test("unknown roles and inactive identity records have no capabilities", () => {
    for (const context of [
      makeContext("unexpected_role"),
      makeContext("organization_admin", {
        membership: { id: "membership-a", organizationId: "tenant-a", userId: "user-a", role: "organization_admin", status: "pending" },
      }),
      makeContext("organization_admin", { organization: { id: "tenant-a", isActive: false } }),
    ]) {
      assert.deepEqual(context.capabilities, []);
      assert.equal(context.active, false);
    }
  });
});

test("C02-AC3 authorization scope enforcement", async (t) => {
  await t.test("allows assigned office managers and tenant admins", () => {
    assert.equal(assertCapability(makeContext("office_manager"), "rooms:manage", {
      organizationId: "tenant-a",
      officeId: "office-a",
    }), true);
    assert.equal(assertCapability(makeContext("organization_admin"), "offices:manage", {
      organizationId: "tenant-a",
      officeId: "office-b",
    }), true);
  });

  await t.test("foreign tenant and unassigned office identifiers both return generic not found", () => {
    for (const scope of [
      { organizationId: "tenant-b", officeId: "office-foreign" },
      { organizationId: "tenant-a", officeId: "office-b" },
      { organizationId: "tenant-a", officeId: "does-not-exist" },
    ]) {
      assert.throws(
        () => assertCapability(makeContext("office_manager"), "rooms:manage", scope),
        { code: "NOT_FOUND", message: "The requested resource was not found." },
      );
    }
  });

  await t.test("denies capability-free roles on direct service calls", () => {
    assert.throws(
      () => assertCapability(makeContext("employee"), "inventory:manage", {
        organizationId: "tenant-a",
        officeId: "office-a",
      }),
      { code: "FORBIDDEN" },
    );
  });
});
