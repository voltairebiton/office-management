# C03 — Office and room management

Status: In progress. Dependencies: C02.

## User outcome

An admin manages office locations, and permitted managers organize rooms without losing history.

## Deliverables

- Office create/list/detail/edit/archive; room create/list/detail/edit/archive.
- Office timezone/address, scoped codes, optional room capacity, active/archived filters.
- Server validation, accessible forms, useful empty/error/pending states, and audit records.

## Acceptance criteria

Label tests `C03-AC1`, `C03-AC2`, etc., matching the numbered criteria below. Shared authorization, audit, validation, and idempotency requirements in the [MVP plan](../README.md) also apply.

1. An admin creates an office with a trimmed nonempty name/code and valid IANA timezone. Office codes are normalized to uppercase and unique within the tenant; other tenants can reuse them.
2. A permitted manager creates/edits rooms only in assigned active offices. Room codes use the same normalization and are unique within their office. Capacity is null or a nonnegative integer.
3. Existing codes are normalized by a reviewed migration; collisions are reported for resolution rather than silently merged. Existing historical references remain valid.
4. Office/room lists are scoped, paginated, searchable, and deterministic. Archived entities are excluded from active selectors.
5. Archiving is rejected while active room assignments remain; office archival also requires all child rooms archived. C06 extends this blocker to nonzero stock before inventory writes become available. Dependents are shown to authorized users so they can resolve them. Recheck blockers transactionally to prevent concurrent assignment/stock writes.
6. Successful archive preserves history and prevents new activity. Repeating an archive is harmless; editing stale records produces a conflict rather than overwriting newer changes.
7. The UI refreshes after committed changes and preserves entered data on validation/provider/database errors. Direct requests enforce the same constraints.

## TDD sequence and evidence

- Red service tests for code normalization/collisions, invalid timezone/capacity, stale edits, and unauthorized office operations.
- PostgreSQL tests for cross-tenant references and archive-versus-new-assignment races; C06 owns the additional archive-versus-stock race coverage when inventory lands.
- Browser journey: create office → create room → edit → attempt blocked archive → resolve dependencies → archive.

## Boundaries and dependencies

No floor-plan editor, seat map, attendance, or room booking. MVP archive defaults are restrictive; no automatic deletion/stock disposal.

## Completion record

- [ ] Acceptance tests written first; meaningful red failures recorded.
- [ ] Implementation and relevant UI complete.
- [ ] Acceptance and regression checks pass; required migrations reviewed/applied to test environment.
- [ ] Authorization and failure behavior verified; documentation updated.
- [ ] Evidence added below; all dependencies complete.

| Criterion | Test/check path | Red failure or live-check prerequisite | Green result | Commit/evidence |
| --- | --- | --- | --- | --- |
| C03-AC1 | `tests/unit/office-validation.test.js` | Initial run failed because `office-validation.js` did not exist | 9 assertions pass locally for normalization, timezone, malformed values, and pagination | In progress; database CI pending |
| C03-AC2, C03-AC4–AC7 | `tests/offices-database.test.js`, office workspace forms | Isolated PostgreSQL service run required; authenticated browser flow needs WorkOS server key | Pending | In progress |
| C03-AC3 | `drizzle/0004_green_cobalt_man.sql` | Migration checks normalized code collisions before applying data changes | Pending fresh-database migration CI | In progress |

Do not mark complete based on a UI screenshot, a build alone, or mocked provider success alone.
