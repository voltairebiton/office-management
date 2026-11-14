function bootstrapError(code, message) {
  return Object.assign(new Error(message), { code });
}

const organizationAdminRoles = new Set(["admin", "organization_admin"]);

export async function bootstrapFirstOrganizationAdmin({
  provider,
  repository,
  userId,
  organizationId,
} = {}) {
  if (
    typeof userId !== "string" ||
    !userId.trim() ||
    typeof organizationId !== "string" ||
    !organizationId.trim()
  ) {
    throw bootstrapError(
      "IDENTITY_BOOTSTRAP_INPUT_INVALID",
      "A WorkOS user ID and organization ID are required for bootstrap.",
    );
  }

  const identity = await provider.loadActiveIdentity({
    userId: userId.trim(),
    organizationId: organizationId.trim(),
  });
  if (
    identity?.user?.workosUserId !== userId.trim() ||
    identity?.organization?.workosOrganizationId !== organizationId.trim() ||
    identity?.membership?.status !== "active"
  ) {
    throw bootstrapError(
      "IDENTITY_MEMBERSHIP_MISMATCH",
      "The provider did not verify an active membership for this user and organization.",
    );
  }

  const providerRoles = new Set(identity.providerRoleSlugs ?? []);
  if (![...organizationAdminRoles].some((role) => providerRoles.has(role))) {
    throw bootstrapError(
      "IDENTITY_BOOTSTRAP_REQUIRES_PROVIDER_ADMIN",
      "The verified WorkOS membership must have an administrator role before bootstrap.",
    );
  }

  try {
    return await repository.transaction(async (transaction) => {
      const user = await transaction.upsertUser(identity.user);
      const organization = await transaction.upsertOrganization(
        identity.organization,
      );
      if (organization.isActive === false) {
        throw bootstrapError(
          "IDENTITY_ORGANIZATION_INACTIVE",
          "This workspace is not active.",
        );
      }
      const membership = await transaction.upsertMembership({
        ...identity.membership,
        userId: user.id,
        organizationId: organization.id,
      });

      if (membership.role === "organization_admin") {
        return { user, organization, membership };
      }
      if ((await transaction.countOrganizationAdmins(organization.id)) > 0) {
        throw bootstrapError(
          "IDENTITY_BOOTSTRAP_ALREADY_COMPLETED",
          "This organization already has an active administrator.",
        );
      }

      return {
        user,
        organization,
        membership: await transaction.setMembershipRole(
          membership.id,
          "organization_admin",
        ),
      };
    });
  } catch (error) {
    if (error?.code?.startsWith("IDENTITY_")) throw error;
    throw bootstrapError(
      "IDENTITY_BOOTSTRAP_UNAVAILABLE",
      "The first organization administrator could not be bootstrapped.",
    );
  }
}
