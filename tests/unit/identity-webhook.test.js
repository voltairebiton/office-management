import assert from "node:assert/strict";
import test from "node:test";
import { processWorkOSMembershipEvent } from "../../src/lib/identity-webhook.js";

const event = (type = "organization_membership.created", overrides = {}) => ({
  id: "event_01",
  event: type,
  createdAt: "2026-11-14T10:00:00.000Z",
  data: {
    id: "membership_01",
    userId: "user_01",
    organizationId: "org_01",
  },
  ...overrides,
});

function fixture({ identity, claim = true, providerError } = {}) {
  const calls = [];
  const provider = {
    async loadActiveIdentity(ids) {
      calls.push(["loadActiveIdentity", ids]);
      if (providerError) throw providerError;
      return identity;
    },
  };
  const repository = {
    async hasProcessedWorkOSEvent(id) {
      calls.push(["hasProcessedWorkOSEvent", id]);
      return !claim;
    },
    async transaction(work) {
      calls.push(["transaction"]);
      return work({
        async claimWorkOSEvent(...args) {
          calls.push(["claimWorkOSEvent", ...args]);
          return claim;
        },
        async upsertUser(value) {
          calls.push(["upsertUser", value]);
          return { id: "local-user", ...value };
        },
        async upsertOrganization(value) {
          calls.push(["upsertOrganization", value]);
          return { id: "local-org", ...value };
        },
        async upsertMembership(value) {
          calls.push(["upsertMembership", value]);
          return { id: "local-membership", ...value };
        },
        async deactivateMembership(id) {
          calls.push(["deactivateMembership", id]);
        },
      });
    },
  };
  return { provider, repository, calls };
}

const activeIdentity = {
  user: { workosUserId: "user_01", email: "ada@example.invalid", displayName: "Ada" },
  organization: { workosOrganizationId: "org_01", name: "Analytical Engines" },
  membership: { workosMembershipId: "membership_01", status: "active", role: null },
  providerRoleSlugs: ["admin"],
};

test("C01 signed WorkOS membership events", async (t) => {
  await t.test("reconciles current active provider state and records the event atomically", async () => {
    const { provider, repository, calls } = fixture({ identity: activeIdentity });
    const result = await processWorkOSMembershipEvent({
      provider,
      repository,
      event: event(),
    });
    assert.equal(result.processed, true);
    assert.ok(calls.some(([name]) => name === "claimWorkOSEvent"));
    assert.ok(calls.some(([name]) => name === "upsertMembership"));
  });

  await t.test("deactivates local access when the authoritative membership is gone", async () => {
    const { provider, repository, calls } = fixture({
      providerError: Object.assign(new Error("not found"), {
        code: "IDENTITY_MEMBERSHIP_NOT_FOUND",
      }),
    });
    const result = await processWorkOSMembershipEvent({
      provider,
      repository,
      event: event("organization_membership.deleted"),
    });
    assert.equal(result.processed, true);
    assert.ok(calls.some(([name, id]) => name === "deactivateMembership" && id === "membership_01"));
  });

  await t.test("returns already-processed events without changing identity", async () => {
    const { provider, repository, calls } = fixture({ identity: activeIdentity, claim: false });
    const result = await processWorkOSMembershipEvent({ provider, repository, event: event() });
    assert.equal(result.duplicate, true);
    assert.ok(!calls.some(([name]) => name === "upsertMembership"));
  });

  await t.test("ignores unrelated signed event types", async () => {
    const { provider, repository, calls } = fixture({ identity: activeIdentity });
    const result = await processWorkOSMembershipEvent({
      provider,
      repository,
      event: event("organization.updated"),
    });
    assert.equal(result.ignored, true);
    assert.equal(calls.length, 0);
  });

  await t.test("provider outages remain retryable and do not claim the event", async () => {
    const { provider, repository, calls } = fixture({
      providerError: Object.assign(new Error("private provider detail"), {
        code: "IDENTITY_PROVIDER_UNAVAILABLE",
      }),
    });
    await assert.rejects(
      processWorkOSMembershipEvent({ provider, repository, event: event() }),
      (error) => error.code === "IDENTITY_PROVIDER_UNAVAILABLE" &&
        !error.message.includes("private provider detail"),
    );
    assert.ok(!calls.some(([name]) => name === "claimWorkOSEvent"));
  });

  await t.test("rejects malformed events and mismatched provider data", async () => {
    const { provider, repository, calls } = fixture({
      identity: {
        ...activeIdentity,
        organization: { ...activeIdentity.organization, workosOrganizationId: "org_other" },
      },
    });
    await assert.rejects(
      processWorkOSMembershipEvent({ provider, repository, event: event("organization_membership.updated", {
        data: { id: "membership_01", userId: "user_01" },
      }) }),
      { code: "IDENTITY_WEBHOOK_INVALID" },
    );
    await assert.rejects(
      processWorkOSMembershipEvent({ provider, repository, event: event() }),
      { code: "IDENTITY_MEMBERSHIP_MISMATCH" },
    );
    assert.ok(!calls.some(([name]) => name === "claimWorkOSEvent"));
  });
});
