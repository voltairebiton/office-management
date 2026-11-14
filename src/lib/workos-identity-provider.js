import { buildIdentityProjection } from "./identity-projection.js";

function providerError(code, message) {
  return Object.assign(new Error(message), { code });
}

function requiredId(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw providerError("IDENTITY_REQUEST_INVALID", `A verified ${name} is required.`);
  }
  return value.trim();
}

export function createWorkOSIdentityProvider({ workos, webhookSecret } = {}) {
  if (!workos?.userManagement || !workos?.organizations || !workos?.webhooks) {
    throw providerError(
      "IDENTITY_PROVIDER_NOT_CONFIGURED",
      "The identity provider is not configured.",
    );
  }

  return {
    async updateOrganizationName({ organizationId, name } = {}) {
      const verifiedOrganizationId = requiredId(organizationId, "verified organization ID");
      const verifiedName = typeof name === "string" ? name.trim() : "";
      if (!verifiedName) {
        throw providerError("IDENTITY_REQUEST_INVALID", "A workspace name is required.");
      }
      try {
        return await workos.organizations.updateOrganization({
          organization: verifiedOrganizationId,
          name: verifiedName,
        });
      } catch {
        throw providerError(
          "IDENTITY_PROVIDER_UNAVAILABLE",
          "The identity provider could not update this workspace. Retry the request.",
        );
      }
    },

    async loadActiveIdentity({ userId, organizationId } = {}) {
      const verifiedUserId = requiredId(userId, "verified user ID");
      const verifiedOrganizationId = requiredId(
        organizationId,
        "verified organization ID",
      );

      let user;
      let organization;
      let memberships;
      try {
        [user, organization, memberships] = await Promise.all([
          workos.userManagement.getUser(verifiedUserId),
          workos.organizations.getOrganization(verifiedOrganizationId),
          workos.userManagement.listOrganizationMemberships({
            userId: verifiedUserId,
            organizationId: verifiedOrganizationId,
            statuses: ["active"],
            limit: 10,
          }),
        ]);
      } catch {
        throw providerError(
          "IDENTITY_PROVIDER_UNAVAILABLE",
          "The identity provider could not verify the current workspace. Retry the request.",
        );
      }

      let membership = null;
      for await (const candidate of memberships) {
        if (
          candidate?.userId === verifiedUserId &&
          candidate?.organizationId === verifiedOrganizationId &&
          candidate?.status === "active"
        ) {
          membership = candidate;
          break;
        }
      }

      if (!membership) {
        throw providerError(
          "IDENTITY_MEMBERSHIP_NOT_FOUND",
          "An active membership in this workspace is required.",
        );
      }

      const projection = buildIdentityProjection({ user, organization, membership });
      const providerRoleSlugs = [
        membership.role?.slug,
        ...(Array.isArray(membership.roles)
          ? membership.roles.map((role) => role?.slug)
          : []),
      ].filter((slug, index, roles) =>
        typeof slug === "string" && slug && roles.indexOf(slug) === index,
      );
      return { ...projection, providerRoleSlugs };
    },

    async verifyWebhook({ rawBody, signature } = {}) {
      if (!webhookSecret) {
        throw providerError(
          "WEBHOOK_NOT_CONFIGURED",
          "Webhook verification is not configured.",
        );
      }
      if (typeof rawBody !== "string" || typeof signature !== "string" || !signature) {
        throw providerError(
          "WEBHOOK_SIGNATURE_INVALID",
          "The webhook signature is invalid.",
        );
      }

      try {
        return await workos.webhooks.constructEvent({
          payload: rawBody,
          sigHeader: signature,
          secret: webhookSecret,
        });
      } catch {
        throw providerError(
          "WEBHOOK_SIGNATURE_INVALID",
          "The webhook signature is invalid or expired.",
        );
      }
    },
  };
}
