import assert from "node:assert/strict";
import test from "node:test";
import { bootstrapFirstOrganizationAdmin } from "../../src/lib/identity-bootstrap.js";

function setup({ existingAdmins = 0, currentRole = null } = {}) {
  const calls = [];
  const repository = {
    async transaction(work) {
      calls.push(["transaction"]);
      return work({
        upsertUser: async (value) => ({ id: "local-user", ...value }),
        upsertOrganization: async (value) => ({ id: "local-org", ...value }),
        upsertMembership: async (value) => ({
          id: "local-membership",
          ...value,
          role: currentRole ?? value.role,
        }),
        countOrganizationAdmins: async () => existingAdmins,
        setMembershipRole: async (id, role) => {
          calls.push(["setMembershipRole", id, role]);
          return { id, role, status: "active" };
        },
      });
    },
  };
  return { repository, calls };
}

const activeAdminProjection = {
  user: { workosUserId: "user_01", email: "ada@example.invalid", displayName: "Ada Lovelace" },
  organization: { workosOrganizationId: "org_01", name: "Analytical Engines" },
  membership: { workosMembershipId: "om_01", status: "active", role: null },
  providerRoleSlugs: ["admin"],
};

test("C01 first-tenant administrator bootstrap", async (t) => {
  await t.test("promotes only a provider-verified administrator through an explicit operator operation", async () => {
    const { repository, calls } = setup();
    const requested = [];
    const result = await bootstrapFirstOrganizationAdmin({
      provider: { loadActiveIdentity: async (ids) => { requested.push(ids); return activeAdminProjection; } },
      repository,
      userId: "user_01",
      organizationId: "org_01",
    });
    assert.deepEqual(requested, [{ userId: "user_01", organizationId: "org_01" }]);
    assert.deepEqual(calls, [
      ["transaction"],
      ["setMembershipRole", "local-membership", "organization_admin"],
    ]);
    assert.equal(result.membership.role, "organization_admin");
  });

  await t.test("refuses an active member with no recognized administrator role", async () => {
    const { repository, calls } = setup();
    await assert.rejects(
      bootstrapFirstOrganizationAdmin({
        provider: { loadActiveIdentity: async () => ({
          ...activeAdminProjection,
          providerRoleSlugs: ["member"],
        }) },
        repository,
        userId: "user_01",
        organizationId: "org_01",
      }),
      { code: "IDENTITY_BOOTSTRAP_REQUIRES_PROVIDER_ADMIN" },
    );
    assert.equal(calls.length, 0);
  });

  await t.test("never grants a second initial administrator", async () => {
    const { repository, calls } = setup({ existingAdmins: 1 });
    await assert.rejects(
      bootstrapFirstOrganizationAdmin({
        provider: { loadActiveIdentity: async () => activeAdminProjection },
        repository,
        userId: "user_01",
        organizationId: "org_01",
      }),
      { code: "IDENTITY_BOOTSTRAP_ALREADY_COMPLETED" },
    );
    assert.deepEqual(calls, [["transaction"]]);
  });

  await t.test("is retry-safe for the already bootstrapped member", async () => {
    const { repository, calls } = setup({ currentRole: "organization_admin", existingAdmins: 1 });
    const result = await bootstrapFirstOrganizationAdmin({
      provider: { loadActiveIdentity: async () => activeAdminProjection },
      repository,
      userId: "user_01",
      organizationId: "org_01",
    });
    assert.equal(result.membership.role, "organization_admin");
    assert.deepEqual(calls, [["transaction"]]);
  });
});
