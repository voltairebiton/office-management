# C02 — Tenant and office authorization

Status: In progress. Dependencies: C01.

## User outcome

Every read and write is constrained to the actor’s current tenant, capabilities, and permitted offices.

## Deliverables

- Build one server context/authorization service used by all business operations.
- Implement the role/capability defaults in the MVP plan and office access lifecycle checks.
- Establish consistent error mapping and an auditable business-mutation pattern.

## Acceptance criteria

Label tests `C02-AC1`, `C02-AC2`, etc., matching the numbered criteria below. Shared authorization, audit, validation, and idempotency requirements in the [MVP plan](../README.md) also apply.

1. Context contains verified actor, local organization UUID, authoritative capabilities, and permitted active offices. Browser-supplied roles/tenant IDs cannot override it.
2. Organization admins operate across their own tenant; office managers operate only in assigned active offices. Employee/helper/reception roles cannot invoke inventory or administrative writes without explicit capabilities.
3. Every resource lookup is tenant-scoped. Foreign tenant/office IDs receive the same NOT_FOUND shape as nonexistent resources, including on direct mutation requests.
4. Unknown roles, missing capabilities, inactive tenants/memberships/access, and provider failures deny protected business operations.
5. Removing office access immediately prevents subsequent scoped reads/writes. Access changes and room-assignment cleanup follow C04 atomically.
6. Domain services, not just pages, enforce authorization. Mutations validate origin/CSRF as appropriate. Authorization failures do not create business audit entries claiming success.
7. Successful writes store sanitized actor/resource audit information in the same transaction. Audit history cannot be edited through business APIs.

## TDD sequence and evidence

- Red table-driven capability tests covering each role, explicit grants, absent grants, and mixed capabilities.
- Integration tests attempt each service with tenant A, tenant B, and two offices in A; assert both response and unchanged state.
- Direct handler tests bypass the UI and spoof IDs/roles/session-like headers.
- Browser acceptance for denied menu destinations and loss of office access.

## Boundaries and dependencies

Composite foreign keys alone are insufficient. RLS is optional defense in depth, not a replacement for these tests. No generalized role-management designer.

## Completion record

- [ ] Acceptance tests written first; meaningful red failures recorded.
- [ ] Implementation and relevant UI complete.
- [ ] Acceptance and regression checks pass; required migrations reviewed/applied to test environment.
- [ ] Authorization and failure behavior verified; documentation updated.
- [ ] Evidence added below; all dependencies complete.

| Criterion | Test/check path | Red failure or live-check prerequisite | Green result | Commit/evidence |
| --- | --- | --- | --- | --- |
| Capability policy and scoped context | `tests/unit/authorization.test.js`, `tests/authorization-database.test.js` | Missing module first; role escalation, inactive office, foreign tenant, and unassigned office cases | Unit and PostgreSQL authorization tests pass on the fresh CI database. | [CI run 43613705365](https://github.com/voltairebiton/office-management/actions/runs/43613705365); real signed-in browser checks still depend on WorkOS credentials. |
| Immutable audit trail | `tests/unit/audit.test.js`, `tests/audit-database.test.js`, `src/lib/audit-repository.js` | Missing serializer first; secret fields and invalid actor/resource scopes rejected | Unit plus insert/update/delete/truncate database assertions pass in CI. | Migration `0003` adds composite tenant/actor/office FKs and write-protection triggers; [CI run 43613705365](https://github.com/voltairebiton/office-management/actions/runs/43613705365). |

Do not mark complete based on a UI screenshot, a build alone, or mocked provider success alone.
