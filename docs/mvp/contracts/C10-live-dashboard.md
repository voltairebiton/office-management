# C10 — Live workspace integration and usable staff screens

Status: Open. Dependencies: C03–C09.

## User outcome

Staff complete the MVP workflows from the dashboard using real authorized data.

## Deliverables

- Connect shared dashboard/sidebar to real tenant and office services and active organization context.
- Integrate overview counts, room needs, catalog, movements, assignments, and account/workspace settings.
- Retain the public fictional preview as a separate read-only route.
- Complete responsive, accessible, loading, empty, and recoverable error states across the workflows.

## Acceptance criteria

Label tests `C10-AC1`, `C10-AC2`, etc., matching the numbered criteria below. Shared authorization, audit, validation, and idempotency requirements in the [MVP plan](../README.md) also apply.

1. Every staff view reads authorized persisted data. Preview fixtures are never used as a fallback for an empty tenant or provider/database failure.
2. Changing office scope changes lists and aggregates consistently and never expands beyond permitted offices. Empty tenants show actionable onboarding based on permission.
3. Overview offices/rooms are active-only; assigned employee totals count distinct active members across selected offices. Rooms-needing-supplies counts distinct rooms, not requirement lines.
4. Sidebar destinations and mutation controls reflect actual capabilities, while direct requests remain server protected. Employee roles see their permitted own-assignment experience.
5. Committed mutations refresh relevant data; errors preserve form input. Loading states prevent accidental new requests while preserving safe idempotent retries. Filters have clear empty-result states and URL/back navigation behavior.
6. Workspace settings expose the verified organization/account context and allowed basic organization-name management only for admins; authorization and stale-update rules apply. Provider-owned role/membership changes use authoritative flows.
7. Keyboard users can navigate, submit forms, understand field errors, and use the mobile dialog with correct focus restoration. Tables remain usable on narrow screens. Automated accessibility checks have no unresolved serious violations.
8. Public preview remains clearly fictional, read-only, and independent of Neon/tenant services. Planned services are labelled and cannot accept real orders or visitor data.

## TDD sequence and evidence

- Red service-query tests for filtered aggregates, distinct member counts, and data failure versus empty results.
- Browser journeys exercise each role, office scope changes, CRUD forms, browser back, refresh, retry, mobile menu, and keyboard errors.
- Public preview/anonymous tests assert no staff data or mutation access.
- Review real populated and empty states; screenshots support visual evidence, not substitutes for behavior assertions.

## Boundaries and dependencies

No analytics warehouse, chart-only metrics, custom dashboard widgets, or implementation jargon in normal staff workflows.

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
