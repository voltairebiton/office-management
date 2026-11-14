const capabilitiesByRole = Object.freeze({
  organization_admin: Object.freeze([
    "tenant:manage",
    "members:read",
    "members:manage",
    "office-access:manage",
    "offices:read",
    "offices:manage",
    "rooms:manage",
    "assignments:manage",
    "inventory:read",
    "inventory:manage",
    "stock:correct",
    "requirements:manage",
  ]),
  office_manager: Object.freeze([
    "offices:read",
    "rooms:manage",
    "assignments:manage",
    "inventory:read",
    "inventory:manage",
    "stock:correct",
    "requirements:manage",
  ]),
  employee: Object.freeze(["assignments:read:self"]),
  office_helper: Object.freeze(["assignments:read:self"]),
  reception: Object.freeze(["assignments:read:self"]),
  security: Object.freeze(["assignments:read:self"]),
});
const knownCapabilities = new Set(Object.values(capabilitiesByRole).flat());

function authorizationError(code) {
  const message =
    code === "NOT_FOUND"
      ? "The requested resource was not found."
      : "You do not have permission to perform this action.";
  return Object.assign(new Error(message), { code });
}

function freezeContext(context) {
  Object.freeze(context.capabilities);
  Object.freeze(context.officeIds);
  return Object.freeze(context);
}

export function buildAuthorizationContext({
  actor,
  organization,
  membership,
  offices = [],
  officeAssignments = [],
} = {}) {
  const role = membership?.role;
  const roleCapabilities = capabilitiesByRole[role] ?? [];
  const identityIsActive =
    membership?.status === "active" &&
    organization?.isActive === true &&
    organization?.id === membership?.organizationId &&
    actor?.id === membership?.userId &&
    Object.hasOwn(capabilitiesByRole, role);

  const activeOffices = new Set(
    offices
      .filter(
        (office) =>
          office?.organizationId === organization?.id &&
          office?.isActive === true &&
          typeof office?.id === "string",
      )
      .map((office) => office.id),
  );
  const assignedOffices = new Set(
    officeAssignments
      .filter(
        (assignment) =>
          assignment?.organizationId === organization?.id &&
          assignment?.membershipId === membership?.id &&
          assignment?.isActive === true &&
          activeOffices.has(assignment.officeId),
      )
      .map((assignment) => assignment.officeId),
  );
  const officeIds = !identityIsActive
    ? []
    : role === "organization_admin"
      ? [...activeOffices]
      : [...assignedOffices];
  const grantedCapabilities = Array.isArray(membership?.grantedCapabilities)
    ? membership.grantedCapabilities.filter((capability) =>
        knownCapabilities.has(capability),
      )
    : [];

  return freezeContext({
    active: identityIsActive,
    actorUserId: actor?.id ?? null,
    organizationId: organization?.id ?? null,
    membershipId: membership?.id ?? null,
    role: identityIsActive ? role : null,
    capabilities: identityIsActive
      ? [...new Set([...roleCapabilities, ...grantedCapabilities])]
      : [],
    officeIds: officeIds.sort(),
  });
}

export function hasCapability(context, capability) {
  return Boolean(
    context?.active && context.capabilities?.includes(capability),
  );
}

export function assertCapability(
  context,
  capability,
  { organizationId, officeId } = {},
) {
  if (
    organizationId &&
    organizationId !== context?.organizationId
  ) {
    throw authorizationError("NOT_FOUND");
  }
  if (officeId && !context?.officeIds?.includes(officeId)) {
    throw authorizationError("NOT_FOUND");
  }
  if (!hasCapability(context, capability)) {
    throw authorizationError("FORBIDDEN");
  }
  return true;
}
