# C04 — People, office access, and room assignments

Status: Open. Dependencies: C02, C03.

## User outcome

Authorized staff can locate employees by assigned room and manage changes with preserved history.

## Deliverables

- Tenant member directory populated from WorkOS, with role/status and paginated filtering.
- Admin grants/revokes office access. Managers assign already-authorized employees to rooms.
- Room reassignment/end-assignment, own-assignment view, active assigned counts and history.
- Onboarding uses WorkOS invitations/operator workflow; no local passwords or fabricated identities.

## Acceptance criteria

Label tests `C04-AC1`, `C04-AC2`, etc., matching the numbered criteria below. Shared authorization, audit, validation, and idempotency requirements in the [MVP plan](../README.md) also apply.

1. The directory exposes only the current tenant’s permitted member data. An employee can read their own assignments without gaining the full staff directory.
2. Only an organization admin grants office access to an active member in the same tenant. Managers cannot create role/office-access grants by changing request input.
3. A room assignment requires an active member, active office access, and active room/office in the same scope. One active room is allowed per member per office; multiple offices remain possible.
4. Reassignment closes the previous record and opens the new record atomically with server timestamps. Failure leaves the old assignment intact; historical rows are retained.
5. Concurrent assignment requests cannot create two active assignments. A stale request returns CONFLICT rather than silently moving the person again.
6. Revoking office access closes that member’s active room assignment in the same transaction. Membership deactivation ends its active assignments and removes active headcounts without deleting history.
7. Room counts mean assigned employees, not attendance. Across offices, total employees uses distinct active members while per-office counts may include the same person. Capacity is advisory in this MVP; exceeding it shows a notice but does not block an assignment.
8. Invitations, if initiated through the product, require an explicit authorized admin action; retries do not send duplicates. No real invitations are sent by automated tests.

## TDD sequence and evidence

- Red tests for inactive member, foreign membership, missing/revoked office access, and manager role escalation attempts.
- Transaction and two-connection tests for reassignments, stale versions, access revocation, and membership deactivation.
- Browser journey with admin and manager sessions plus employee own-view denial checks.
- Provider adapter tests for invitation retry behavior; staging invitation acceptance is a live check.

## Boundaries and dependencies

No HR profiles, attendance, payroll, bulk imports, or per-seat assignment. Capacity blocking is deliberately deferred and documented.

## Completion record

- [ ] Acceptance tests written first; meaningful red failures recorded.
- [ ] Implementation and relevant UI complete.
- [ ] Acceptance and regression checks pass; required migrations reviewed/applied to test environment.
- [ ] Authorization and failure behavior verified; documentation updated.
- [ ] Evidence added below; all dependencies complete.

| Criterion | Test/check path | Red failure or live-check prerequisite | Green result | Commit/evidence |
| --- | --- | --- | --- | --- |
| Pending | — | — | — | — |

Do not mark complete based on a UI screenshot, a build alone, or mocked provider success alone.
