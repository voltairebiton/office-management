import assert from "node:assert/strict";
import test from "node:test";
import { buildAuthorizationContext } from "../../src/lib/authorization.js";
import { createOffice, createRoom, listOffices } from "../../src/lib/office-service.js";

const organization = { id: "org-local", isActive: true };
const office = { id: "11111111-1111-4111-8111-111111111111", organizationId: organization.id, isActive: true };
const admin = { id: "user-admin" };
const manager = { id: "user-manager" };
const adminMembership = {
  id: "membership-admin",
  organizationId: organization.id,
  userId: admin.id,
  status: "active",
  role: "organization_admin",
};
const managerMembership = {
  id: "membership-manager",
  organizationId: organization.id,
  userId: manager.id,
  status: "active",
  role: "office_manager",
};
const adminContext = buildAuthorizationContext({
  actor: admin,
  organization,
  membership: adminMembership,
  offices: [office],
});
const unassignedManagerContext = buildAuthorizationContext({
  actor: manager,
  organization,
  membership: managerMembership,
  offices: [office],
});
const unreachableDatabase = {
  transaction() { throw new Error("Database access should not be reached"); },
  select() { throw new Error("Database access should not be reached"); },
};

test("C03 office service denies unauthorized and unscoped requests before database access", async (t) => {
  await t.test("office managers cannot create tenant offices", async () => {
    await assert.rejects(
      createOffice(unassignedManagerContext, { name: "New", code: "NEW" }, unreachableDatabase),
      { code: "FORBIDDEN" },
    );
  });

  await t.test("managers cannot address offices outside their active assignments", async () => {
    await assert.rejects(
      createRoom(unassignedManagerContext, office.id, { name: "Room", code: "R1" }, unreachableDatabase),
      { code: "NOT_FOUND", message: "The requested resource was not found." },
    );
  });

  await t.test("employee roles cannot list the office directory", async () => {
    const employeeContext = buildAuthorizationContext({
      actor: { id: "user-employee" },
      organization,
      membership: {
        id: "membership-employee",
        organizationId: organization.id,
        userId: "user-employee",
        status: "active",
        role: "employee",
      },
      offices: [office],
    });
    await assert.rejects(listOffices(employeeContext, {}, unreachableDatabase), { code: "FORBIDDEN" });
  });

  await t.test("invalid office input is rejected before database access", async () => {
    await assert.rejects(createOffice(adminContext, { name: "  ", code: "bad code" }, unreachableDatabase), {
      code: "VALIDATION",
      fieldErrors: { name: "Enter a name.", code: "Use 1–32 letters, numbers, hyphens, or underscores." },
    });
  });
});
