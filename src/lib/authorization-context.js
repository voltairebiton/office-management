import "server-only";
import { and, eq } from "drizzle-orm";
import {
  officeAssignments,
  offices,
  organizationMemberships,
  organizations,
} from "../db/schema.js";
import { getDatabase } from "../db/index.js";
import { buildAuthorizationContext } from "./authorization.js";

export async function loadAuthorizationContext({
  actorUserId,
  organizationId,
  membershipId,
  database = getDatabase(),
} = {}) {
  if (
    typeof actorUserId !== "string" || !actorUserId ||
    typeof organizationId !== "string" || !organizationId ||
    typeof membershipId !== "string" || !membershipId
  ) {
    return buildAuthorizationContext({
      actor: { id: actorUserId ?? null },
      organization: { id: organizationId ?? null, isActive: false },
      membership: {
        id: membershipId ?? null,
        organizationId: organizationId ?? null,
        userId: actorUserId ?? null,
        status: "inactive",
        role: null,
      },
    });
  }

  const [organizationRecord] = await database
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId ?? ""))
    .limit(1);
  const [membershipRecord] = await database
    .select()
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.id, membershipId ?? ""),
        eq(organizationMemberships.organizationId, organizationId ?? ""),
        eq(organizationMemberships.userId, actorUserId ?? ""),
      ),
    )
    .limit(1);

  const officeRecords = organizationRecord
    ? await database
        .select()
        .from(offices)
        .where(eq(offices.organizationId, organizationRecord.id))
    : [];
  const assignmentRecords = membershipRecord
    ? await database
        .select()
        .from(officeAssignments)
        .where(
          and(
            eq(officeAssignments.organizationId, organizationRecord.id),
            eq(officeAssignments.membershipId, membershipRecord.id),
          ),
        )
    : [];

  return buildAuthorizationContext({
    actor: { id: actorUserId ?? null },
    organization: organizationRecord ?? {
      id: organizationId ?? null,
      isActive: false,
    },
    membership: membershipRecord ?? {
      id: membershipId ?? null,
      organizationId: organizationId ?? null,
      userId: actorUserId ?? null,
      role: null,
      status: "inactive",
    },
    offices: officeRecords,
    officeAssignments: assignmentRecords,
  });
}
