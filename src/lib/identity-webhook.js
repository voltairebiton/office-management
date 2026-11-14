function webhookError(code, message) {
  return Object.assign(new Error(message), { code });
}

const membershipEvents = new Set([
  "organization_membership.created",
  "organization_membership.updated",
  "organization_membership.deleted",
]);

function readField(value, camelCase, snakeCase) {
  return value?.[camelCase] ?? value?.[snakeCase];
}

function parseMembershipEvent(event) {
  const eventId = event?.id;
  const eventType = event?.event;
  const data = event?.data;
  const membershipId = readField(data, "id", "id");
  const userId = readField(data, "userId", "user_id");
  const organizationId = readField(data, "organizationId", "organization_id");

  if (
    typeof eventId !== "string" || !eventId.trim() ||
    typeof eventType !== "string" || !membershipEvents.has(eventType) ||
    typeof membershipId !== "string" || !membershipId.trim() ||
    typeof userId !== "string" || !userId.trim() ||
    typeof organizationId !== "string" || !organizationId.trim()
  ) {
    throw webhookError(
      "IDENTITY_WEBHOOK_INVALID",
      "The signed identity event is missing required fields.",
    );
  }

  const providerCreatedAt = readField(event, "createdAt", "created_at");
  const parsedCreatedAt = providerCreatedAt ? new Date(providerCreatedAt) : null;
  if (parsedCreatedAt && Number.isNaN(parsedCreatedAt.getTime())) {
    throw webhookError(
      "IDENTITY_WEBHOOK_INVALID",
      "The signed identity event has an invalid timestamp.",
    );
  }

  return {
    eventId: eventId.trim(),
    eventType,
    membershipId: membershipId.trim(),
    userId: userId.trim(),
    organizationId: organizationId.trim(),
    providerCreatedAt: parsedCreatedAt,
  };
}

export async function processWorkOSMembershipEvent({
  provider,
  repository,
  event,
} = {}) {
  if (!membershipEvents.has(event?.event)) return { ignored: true };
  const input = parseMembershipEvent(event);
  if (await repository.hasProcessedWorkOSEvent(input.eventId)) {
    return { duplicate: true };
  }

  let identity = null;
  try {
    identity = await provider.loadActiveIdentity({
      userId: input.userId,
      organizationId: input.organizationId,
    });
  } catch (error) {
    if (error?.code !== "IDENTITY_MEMBERSHIP_NOT_FOUND") {
      if (error?.code === "IDENTITY_PROVIDER_UNAVAILABLE") {
        throw webhookError(
          "IDENTITY_PROVIDER_UNAVAILABLE",
          "WorkOS could not reconcile the identity event. Retry the delivery.",
        );
      }
      throw webhookError(
        "IDENTITY_PROVIDER_UNAVAILABLE",
        "WorkOS could not reconcile the identity event. Retry the delivery.",
      );
    }
  }

  if (
    identity &&
    (identity.user?.workosUserId !== input.userId ||
      identity.organization?.workosOrganizationId !== input.organizationId ||
      identity.membership?.status !== "active")
  ) {
    throw webhookError(
      "IDENTITY_MEMBERSHIP_MISMATCH",
      "The provider state does not match the signed identity event.",
    );
  }

  try {
    return await repository.transaction(async (transaction) => {
      const claimed = await transaction.claimWorkOSEvent({
        workosEventId: input.eventId,
        eventType: input.eventType,
        providerCreatedAt: input.providerCreatedAt,
      });
      if (!claimed) return { duplicate: true };

      if (!identity) {
        await transaction.deactivateMembership(input.membershipId);
        return { processed: true, active: false };
      }

      const user = await transaction.upsertUser(identity.user);
      const organization = await transaction.upsertOrganization(
        identity.organization,
      );
      const membership = await transaction.upsertMembership({
        ...identity.membership,
        userId: user.id,
        organizationId: organization.id,
      });
      return { processed: true, active: true, membershipId: membership.id };
    });
  } catch (error) {
    if (error?.code?.startsWith("IDENTITY_")) throw error;
    throw webhookError(
      "IDENTITY_SYNC_UNAVAILABLE",
      "The identity event could not be recorded. WorkOS may safely retry it.",
    );
  }
}
