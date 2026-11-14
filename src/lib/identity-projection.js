function identityError(code, message) {
  return Object.assign(new Error(message), { code });
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw identityError(
      "IDENTITY_PROVIDER_DATA_INVALID",
      `The identity provider returned an invalid ${field}.`,
    );
  }
  return value.trim();
}

export function buildIdentityProjection({ user, organization, membership } = {}) {
  const userId = requiredString(user?.id, "user ID");
  const organizationId = requiredString(organization?.id, "organization ID");
  const membershipId = requiredString(membership?.id, "membership ID");
  const email = requiredString(user?.email, "email address").toLowerCase();
  const organizationName = requiredString(organization?.name, "organization name");

  if (
    membership?.userId !== userId ||
    membership?.organizationId !== organizationId
  ) {
    throw identityError(
      "IDENTITY_MEMBERSHIP_MISMATCH",
      "The identity provider membership does not match the signed-in user and organization.",
    );
  }

  if (membership?.status !== "active") {
    throw identityError(
      "IDENTITY_MEMBERSHIP_INACTIVE",
      "An active identity provider membership is required.",
    );
  }

  const displayName = [user?.firstName, user?.lastName]
    .filter((part) => typeof part === "string" && part.trim())
    .map((part) => part.trim())
    .join(" ");

  return {
    user: {
      workosUserId: userId,
      email,
      displayName: displayName || null,
    },
    organization: {
      workosOrganizationId: organizationId,
      name: organizationName,
    },
    membership: {
      workosMembershipId: membershipId,
      status: "active",
      // Provider role names are not our authorization policy. Start non-privileged.
      role: null,
    },
  };
}
