# C10 — Live workspace integration and usable staff screens

Status: Implementation and fresh PostgreSQL CI complete; authenticated WorkOS acceptance remains. Dependencies: C03–C09.

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

The live overview is assembled by `loadWorkspaceOverview()` from the verified organization context. Office and room totals are active-only; room-assigned people are distinct across the selected scope; shortage room counts are distinct from requirement lines. Recent transfers are grouped to one activity and capped at twelve. The overview never substitutes preview fixtures on database failure. Organization renames are admin-only, go through the verified WorkOS organization ID, use a stale-name check, and write an audit event.

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
| AC1–AC3 | tests/unit/workspace-overview.test.js; tests/workspace-overview-database.test.js | Overview mapper tests first failed against the initial null stub; CI exposed and corrected invalid fixture codes and receipt reason. Local isolated TEST_DATABASE_URL is unavailable. | Fresh PostgreSQL verifies active-only and distinct aggregates, empty-live vs database-failure behavior, tenant/office scope, shortages, grouped activity, rename authorization, and audit. | [CI run 43629602410](https://github.com/voltairebiton/office-management/actions/runs/43629602410), commit `f84ca40` |
| AC2–AC3 | src/lib/workspace-dashboard-service.js; src/lib/room-requirement-service.js | Authenticated browser acceptance requires staging WorkOS identities. | Overview shows active office/room totals, per-office assignment and shortage counts, and distinct tenant-wide assigned people. Office selection filters visible lists and metrics without expanding authorized scope. | [CI run 43629602410](https://github.com/voltairebiton/office-management/actions/runs/43629602410); live journey pending |
| AC4 | src/lib/workspace-navigation.js; tests/unit/workspace-navigation.test.js; src/app/dashboard/page.js | Capability tests cover employee menu visibility and direct-view authorization decisions. | Navigation is capability-filtered; employees with own-assignment access open their own assignments by default; server views retain service-level authorization. | [CI run 43629602410](https://github.com/voltairebiton/office-management/actions/runs/43629602410) |
| AC5, AC7 | src/components/workspace-dashboard.js; `tests/e2e/access-and-preview.spec.js` | Authenticated WorkOS forms, keyboard errors, and the live mobile journey require a staging login. | Office selection is kept in the URL, preserved across workspace links, and restored by browser back. Live errors do not show preview data; pending, field-error, and retry states are present. Axe reports no serious or critical WCAG 2.1 A/AA violations on all eight workspace views; mobile navigation keyboard/focus checks pass. | [CI run 43629602410](https://github.com/voltairebiton/office-management/actions/runs/43629602410), six browser tests pass; live journey pending |
| AC6 | src/lib/workspace-settings-service.js; src/lib/workos-identity-provider.js; tests/unit/workos-identity-provider.test.js; tests/workspace-overview-database.test.js | Provider call is mocked in automated tests; staging update requires configured WorkOS API credentials. | Only `tenant:manage` can rename; stale names conflict, WorkOS confirms before local update, and the name change is audited. Provider failure is surfaced as retryable. | [CI run 43629602410](https://github.com/voltairebiton/office-management/actions/runs/43629602410); live provider check pending |
| AC8 | tests/e2e/access-and-preview.spec.js | Anonymous preview browser tests run without a tenant database. | Preview remains fictional/read-only, clearly labeled, and its office filter remains independent of signed-in data services. | [CI run 43629602410](https://github.com/voltairebiton/office-management/actions/runs/43629602410) |

Do not mark complete based on a UI screenshot, a build alone, or mocked provider success alone.
