import assert from "node:assert/strict";
import test from "node:test";
import { buildIdentityProjection } from "../../src/lib/identity-projection.js";

const verifiedRecords = () => ({
  user: {
    id: "user_01",
    email: "ada@example.invalid",
    firstName: "Ada",
    lastName: "Lovelace",
  },
  organization: { id: "org_01", name: "Analytical Engines" },
  membership: {
    id: "om_01",
    userId: "user_01",
    organizationId: "org_01",
    status: "active",
    role: { slug: "organization_admin" },
    roles: [{ slug: "organization_admin" }],
  },
});

test("C01 identity projection", async (t) => {
  await t.test("maps authoritative provider IDs and profile details", () => {
    assert.deepEqual(buildIdentityProjection(verifiedRecords()), {
      user: {
        workosUserId: "user_01",
        email: "ada@example.invalid",
        displayName: "Ada Lovelace",
      },
      organization: {
        workosOrganizationId: "org_01",
        name: "Analytical Engines",
      },
      membership: {
        workosMembershipId: "om_01",
        status: "active",
        role: null,
      },
    });
  });

  await t.test("does not elevate a user based on provider role names", () => {
    const projection = buildIdentityProjection(verifiedRecords());
    assert.equal(projection.membership.role, null);
  });

  await t.test("rejects a provider membership for a different user", () => {
    const records = verifiedRecords();
    records.membership.userId = "user_other";
    assert.throws(
      () => buildIdentityProjection(records),
      { code: "IDENTITY_MEMBERSHIP_MISMATCH" },
    );
  });

  await t.test("rejects a provider membership for a different organization", () => {
    const records = verifiedRecords();
    records.membership.organizationId = "org_other";
    assert.throws(
      () => buildIdentityProjection(records),
      { code: "IDENTITY_MEMBERSHIP_MISMATCH" },
    );
  });

  await t.test("rejects pending and inactive provider memberships", () => {
    for (const status of ["pending", "inactive"]) {
      const records = verifiedRecords();
      records.membership.status = status;
      assert.throws(
        () => buildIdentityProjection(records),
        { code: "IDENTITY_MEMBERSHIP_INACTIVE" },
      );
    }
  });

  await t.test("rejects incomplete provider records", () => {
    const records = verifiedRecords();
    records.user.email = " ";
    assert.throws(
      () => buildIdentityProjection(records),
      { code: "IDENTITY_PROVIDER_DATA_INVALID" },
    );
  });
});
