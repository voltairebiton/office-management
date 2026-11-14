function syncError(code, message) {
  return Object.assign(new Error(message), { code });
}

export async function syncIdentityFromSession({
  session,
  provider,
  repository,
} = {}) {
  const userId = session?.user?.id;
  const organizationId = session?.organizationId;
  if (typeof userId !== "string" || !userId.trim()) {
    throw syncError("UNAUTHENTICATED", "A verified user session is required.");
  }
  if (typeof organizationId !== "string" || !organizationId.trim()) {
    throw syncError(
      "IDENTITY_ORGANIZATION_REQUIRED",
      "Choose an active organization before continuing.",
    );
  }
  if (!provider?.loadActiveIdentity || !repository?.transaction) {
    throw syncError(
      "IDENTITY_PROVIDER_NOT_CONFIGURED",
      "Workspace identity synchronization is not configured.",
    );
  }

  const projection = await provider.loadActiveIdentity({
    userId: userId.trim(),
    organizationId: organizationId.trim(),
  });
  if (
    projection?.user?.workosUserId !== userId.trim() ||
    projection?.organization?.workosOrganizationId !== organizationId.trim() ||
    projection?.membership?.status !== "active"
  ) {
    throw syncError(
      "IDENTITY_MEMBERSHIP_MISMATCH",
      "The verified session does not match the active provider membership.",
    );
  }

  try {
    return await repository.transaction(async (transaction) => {
      const user = await transaction.upsertUser(projection.user);
      const organization = await transaction.upsertOrganization(
        projection.organization,
      );
      if (organization.isActive === false) {
        throw syncError(
          "IDENTITY_ORGANIZATION_INACTIVE",
          "This workspace is not active.",
        );
      }
      const membership = await transaction.upsertMembership({
        ...projection.membership,
        organizationId: organization.id,
        userId: user.id,
      });
      return { user, organization, membership };
    });
  } catch (error) {
    if (error?.code?.startsWith("IDENTITY_")) throw error;
    throw syncError(
      "IDENTITY_SYNC_UNAVAILABLE",
      "Workspace identity could not be synchronized. Retry the request.",
    );
  }
}
