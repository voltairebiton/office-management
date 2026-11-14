import assert from "node:assert/strict";
import test from "node:test";
import { syncIdentityFromSession } from "../../src/lib/identity-sync.js";

const projection = {
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
};

function fakeRepository() {
  const calls = [];
  return {
    calls,
    async transaction(work) {
      calls.push(["transaction"]);
      return work({
        upsertUser: async (value) => {
          calls.push(["upsertUser", value]);
          return { id: "local-user", ...value };
        },
        upsertOrganization: async (value) => {
          calls.push(["upsertOrganization", value]);
          return { id: "local-org", ...value };
        },
        upsertMembership: async (value) => {
          calls.push(["upsertMembership", value]);
          return { id: "local-membership", ...value };
        },
      });
    },
  };
}

test("C01 identity session synchronization", async (t) => {
  await t.test("projects only the verified session organization transactionally", async () => {
    const repository = fakeRepository();
    const providerCalls = [];
    const provider = {
      async loadActiveIdentity(ids) {
        providerCalls.push(ids);
        return projection;
      },
    };
    const result = await syncIdentityFromSession({
      provider,
      repository,
      session: { user: { id: "user_01" }, organizationId: "org_01" },
    });

    assert.deepEqual(providerCalls, [{ userId: "user_01", organizationId: "org_01" }]);
    assert.equal(repository.calls.filter(([name]) => name === "transaction").length, 1);
    assert.deepEqual(result, {
      user: { id: "local-user", ...projection.user },
      organization: { id: "local-org", ...projection.organization },
      membership: {
        id: "local-membership",
        ...projection.membership,
        organizationId: "local-org",
        userId: "local-user",
      },
    });
    assert.equal(repository.calls.find(([name]) => name === "upsertMembership")[1].role, null);
  });

  await t.test("rejects missing verified session organization before provider or database access", async () => {
    const repository = fakeRepository();
    let providerCalled = false;
    await assert.rejects(
      syncIdentityFromSession({
        provider: { loadActiveIdentity: async () => { providerCalled = true; return projection; } },
        repository,
        session: { user: { id: "user_01" }, organizationId: null },
      }),
      { code: "IDENTITY_ORGANIZATION_REQUIRED" },
    );
    assert.equal(providerCalled, false);
    assert.equal(repository.calls.length, 0);
  });

  await t.test("does not accept an organization override separate from the session", async () => {
    const repository = fakeRepository();
    const providerCalls = [];
    await syncIdentityFromSession({
      provider: { loadActiveIdentity: async (ids) => { providerCalls.push(ids); return projection; } },
      repository,
      session: { user: { id: "user_01" }, organizationId: "org_01" },
      organizationId: "org_attacker",
    });
    assert.deepEqual(providerCalls, [{ userId: "user_01", organizationId: "org_01" }]);
  });

  await t.test("rejects a provider projection that does not match the verified session", async () => {
    const repository = fakeRepository();
    await assert.rejects(
      syncIdentityFromSession({
        provider: { loadActiveIdentity: async () => ({
          ...projection,
          organization: { ...projection.organization, workosOrganizationId: "org_other" },
        }) },
        repository,
        session: { user: { id: "user_01" }, organizationId: "org_01" },
      }),
      { code: "IDENTITY_MEMBERSHIP_MISMATCH" },
    );
    assert.equal(repository.calls.length, 0);
  });

  await t.test("does not reactivate an organization paused locally", async () => {
    const repository = {
      transaction: async (work) => work({
        upsertUser: async (value) => ({ id: "local-user", ...value }),
        upsertOrganization: async (value) => ({ id: "local-org", ...value, isActive: false }),
        upsertMembership: async () => assert.fail("inactive tenant must stop before membership upsert"),
      }),
    };
    await assert.rejects(
      syncIdentityFromSession({
        provider: { loadActiveIdentity: async () => projection },
        repository,
        session: { user: { id: "user_01" }, organizationId: "org_01" },
      }),
      { code: "IDENTITY_ORGANIZATION_INACTIVE" },
    );
  });

  await t.test("database write failures return a safe retryable error", async () => {
    const repository = {
      transaction: async () => { throw new Error("database secret detail"); },
    };
    await assert.rejects(
      syncIdentityFromSession({
        provider: { loadActiveIdentity: async () => projection },
        repository,
        session: { user: { id: "user_01" }, organizationId: "org_01" },
      }),
      (error) => error.code === "IDENTITY_SYNC_UNAVAILABLE" &&
        !error.message.includes("secret detail"),
    );
  });
});
