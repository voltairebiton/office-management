import assert from "node:assert/strict";
import test from "node:test";
import { createWorkOSIdentityProvider } from "../../src/lib/workos-identity-provider.js";

const records = {
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
  },
};

function fakeWorkOS(overrides = {}) {
  const calls = [];
  const workos = {
    userManagement: {
      getUser: async (id) => {
        calls.push(["getUser", id]);
        return records.user;
      },
      listOrganizationMemberships: async (options) => {
        calls.push(["listOrganizationMemberships", options]);
        return [records.membership];
      },
      ...overrides.userManagement,
    },
    organizations: {
      getOrganization: async (id) => {
        calls.push(["getOrganization", id]);
        return records.organization;
      },
      ...overrides.organizations,
    },
    webhooks: {
      constructEvent: async (options) => {
        calls.push(["constructEvent", options]);
        return { id: "event_01", event: "user.updated", data: records.user };
      },
      ...overrides.webhooks,
    },
  };
  return { workos, calls };
}

test("C01 WorkOS provider adapter", async (t) => {
  await t.test("reconciles identity from session IDs and an active provider membership", async () => {
    const { workos, calls } = fakeWorkOS();
    const provider = createWorkOSIdentityProvider({ workos });
    const projection = await provider.loadActiveIdentity({
      userId: "user_01",
      organizationId: "org_01",
    });

    assert.equal(projection.membership.status, "active");
    assert.equal(projection.membership.role, null);
    assert.deepEqual(calls.find(([name]) => name === "listOrganizationMemberships"), [
      "listOrganizationMemberships",
      {
        userId: "user_01",
        organizationId: "org_01",
        statuses: ["active"],
        limit: 10,
      },
    ]);
  });

  await t.test("updates a verified organization name using its WorkOS organization ID", async () => {
    const { workos, calls } = fakeWorkOS({
      organizations: {
        updateOrganization: async (options) => {
          calls.push(["updateOrganization", options]);
          return { ...records.organization, name: options.name };
        },
      },
    });
    const provider = createWorkOSIdentityProvider({ workos });
    const updated = await provider.updateOrganizationName({ organizationId: "org_01", name: "Manila Operations" });
    assert.equal(updated.name, "Manila Operations");
    assert.deepEqual(calls.at(-1), ["updateOrganization", { organization: "org_01", name: "Manila Operations" }]);
  });

  await t.test("hides provider details when an organization update fails", async () => {
    const { workos } = fakeWorkOS({
      organizations: {
        updateOrganization: async () => { throw new Error("private provider response"); },
      },
    });
    const provider = createWorkOSIdentityProvider({ workos });
    await assert.rejects(provider.updateOrganizationName({ organizationId: "org_01", name: "Updated" }), (error) =>
      error.code === "IDENTITY_PROVIDER_UNAVAILABLE" && !error.message.includes("private provider response"));
  });

  await t.test("does not trust an absent, pending, or mismatched membership", async () => {
    for (const membership of [null, { ...records.membership, status: "pending" }, {
      ...records.membership,
      userId: "user_other",
    }]) {
      const { workos } = fakeWorkOS({
        userManagement: {
          listOrganizationMemberships: async () =>
            membership ? [membership] : [],
        },
      });
      const provider = createWorkOSIdentityProvider({ workos });
      await assert.rejects(
        provider.loadActiveIdentity({ userId: "user_01", organizationId: "org_01" }),
        (error) =>
          ["IDENTITY_MEMBERSHIP_NOT_FOUND", "IDENTITY_MEMBERSHIP_MISMATCH"].includes(
            error.code,
          ),
      );
    }
  });

  await t.test("provider failures are retryable and contain no provider details", async () => {
    const { workos } = fakeWorkOS({
      userManagement: {
        getUser: async () => {
          throw new Error("provider response included private material");
        },
      },
    });
    const provider = createWorkOSIdentityProvider({ workos });
    await assert.rejects(
      provider.loadActiveIdentity({ userId: "user_01", organizationId: "org_01" }),
      (error) =>
        error.code === "IDENTITY_PROVIDER_UNAVAILABLE" &&
        !error.message.includes("private material"),
    );
  });

  await t.test("verifies webhook signatures with the raw body and server secret", async () => {
    const { workos, calls } = fakeWorkOS();
    const provider = createWorkOSIdentityProvider({
      workos,
      webhookSecret: "whsec_test_secret",
    });
    await provider.verifyWebhook({
      rawBody: '{"id":"event_01"}',
      signature: "t=1,v1=signature",
    });
    assert.deepEqual(calls[0], ["constructEvent", {
      payload: '{"id":"event_01"}',
      sigHeader: "t=1,v1=signature",
      secret: "whsec_test_secret",
    }]);
  });

  await t.test("fails closed when webhook verification is not configured", async () => {
    const { workos } = fakeWorkOS();
    const provider = createWorkOSIdentityProvider({ workos });
    await assert.rejects(
      provider.verifyWebhook({ rawBody: "{}", signature: "t=1,v1=signature" }),
      { code: "WEBHOOK_NOT_CONFIGURED" },
    );
  });
});
