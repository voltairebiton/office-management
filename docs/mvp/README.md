# Office Management MVP execution plan

Reviewed: 14 November 2026. This is an implementation plan, not a claim that the MVP is complete. Contracts describe our own product development; they are not Alignerr submission annotations.

## MVP boundary

The MVP is a staff workspace where an organization administrator can onboard a tenant, create offices and rooms, give staff office access, assign employees to rooms, receive office stock, deploy it to rooms, and see room shortages. Office managers operate within assigned offices. Staff authenticate through WorkOS. Business data persists in Neon PostgreSQL.

This follows the previously agreed minimum. Visitor management, QR refreshment ordering, helper queues/notifications, attendance, inter-office transfers, automatic headcount replenishment, recipe deductions, and individually tagged assets are outside this release. The sidebar can explain these planned services, but they must not appear operational. They remain meaningful future feature work.

## What exists

| Area | Evidence / current state |
| --- | --- |
| Repository | Public MIT repository; Next.js App Router, JavaScript, React, npm lockfile |
| Design | Responsive grouped sidebar, overview, module destinations, public fictional preview, office filtering and search in preview |
| Authentication wiring | WorkOS proxy, sign-in/callback/sign-out handlers, protected organization-session helper; not yet verified with a real organization login |
| WorkOS configuration | Office Management staging application has localhost:3107 callback and sign-out URLs; local client ID, cookie secret, and callback configured |
| Database | Dedicated Neon project; Drizzle migration for users, organizations, memberships, offices, office access, rooms, and room assignments |
| Integrity tests | Existing live PostgreSQL suite passes: 12 behavior subtests plus their parent, reported as 13 tests |
| Operational features | No tenant/member projection service, office authorization service, business CRUD, inventory tables, or stock operations yet |
| Automation | No CI workflow, unit/service harness, browser suite, or isolated concurrency-test database configured yet |

The public preview is never an authenticated acceptance environment. A successful build does not establish tenant isolation or complete sign-in. Existing work was not documented as test-first; TDD evidence starts with the contracts below.

## Blockers and dependencies

| Item | Blocks | Can we proceed elsewhere? | Resolution |
| --- | --- | --- | --- |
| WorkOS server API key missing locally | Real organization/member synchronization and fresh membership checks | Yes: test harness, provider adapter tests, schema/service contracts | Configure the Office Management staging server key privately; never commit it |
| Real user + organization sign-in not verified | Authentication acceptance and final release | Yes | Complete an actual staging login and verify organization context, role, logout, and revocation |
| Signed webhook delivery not configured/verified | Automatic WorkOS synchronization acceptance | Yes | Add handler first; then configure staging endpoint and signing secret; validate real delivery |
| No isolated integration/E2E database or CI yet | Safe concurrency/E2E execution and dependable merge gates | Yes: this is C00, the first implementation task | Dedicated test Postgres and explicit test connection; CI service database |
| Hosting URL not selected | Public release, production callbacks, live webhook endpoint | Yes: does not block local MVP work | Select a Next.js-compatible host before C11; configure production URLs and secrets |
| Initial customer/administrator bootstrap unverified | First real usable tenant | Yes | C01 provides an explicit bootstrap path from verified WorkOS ownership/membership; never promote the first arbitrary login |

These are setup dependencies, not reasons to pause all development. No further product decision is needed to start C00. External account steps may require the user to sign in or approve a concrete access change when reached.

## Contract index and sequence

All contracts are open. “Foundation exists” means some supporting code exists, not that acceptance has passed.

| ID | Deliverable | Depends on | State |
| --- | --- | --- | --- |
| [C00](contracts/C00-test-foundation.md) | Test harness, isolation, CI, TDD evidence | None | Open; existing constraint suite only |
| [C01](contracts/C01-identity.md) | Real sign-in, tenant bootstrap, member synchronization | C00 | Open; auth wiring exists |
| [C02](contracts/C02-authorization.md) | Tenant context, office permissions, access lifecycle | C01 | Open |
| [C03](contracts/C03-offices-rooms.md) | Office and room management | C02 | Open; tables exist |
| [C04](contracts/C04-people-assignments.md) | Staff directory, office access, room assignments | C02, C03 | Open; tables exist |
| [C05](contracts/C05-catalog-locations.md) | Item catalog and stock locations | C02, C03 | Open |
| [C06](contracts/C06-ledger-receipts.md) | Atomic ledger, balances, stock receipts | C05 | Open |
| [C07](contracts/C07-transfers.md) | Room deployment and returns | C06 | Open |
| [C08](contracts/C08-stock-corrections.md) | Consumption, damage, and counted-stock corrections | C06 | Open |
| [C09](contracts/C09-room-requirements.md) | Room inventory targets and shortages | C04, C07, C08 | Open |
| [C10](contracts/C10-live-dashboard.md) | Real dashboard and complete staff UI integration | C03–C09 | Open; preview design exists |
| [C11](contracts/C11-release.md) | Complete journeys, deployment, operational readiness | C00–C10 | Open |

Execution order: C00 → C01 → C02 → C03 → C04 → C05 → C06 → C07 → C08 → C09 → C10 → C11. Build each service with its usable UI slice; C10 connects cross-module overview data and checks consistency rather than postponing all UI to the end.

## Shared implementation contract

1. Derive the actor and WorkOS organization from the verified session. Resolve to a local UUID. Every query and mutation uses this context and office authorization. A hidden button is not a security control.
2. Server actions/route handlers validate input, call services, and return stable results. Service signatures are `operation(context, input)`; context cannot be supplied by the browser. Business services are testable without Next.js request globals.
3. Results expose either `{ ok: true, data }` or `{ ok: false, error: { code, message, fieldErrors? } }`. Standard codes: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `INSUFFICIENT_STOCK`, `DEPENDENCY_UNAVAILABLE`. Inaccessible resource IDs return the same `NOT_FOUND` response as absent IDs; forbidden operations on an accessible resource return `FORBIDDEN`. Never return SQL, secrets, or foreign-tenant record details.
4. Use reviewed, versioned migrations and composite tenant/office keys. Preserve history by archiving; reject destructive transitions while active dependents remain. No record moves between tenants.
5. Proposed MVP quantity rule: whole base units only, bounded to the database integer range. Normalize input before validation; reject fractions, negatives where prohibited, NaN, infinity, overflow, and ambiguous numeric formats. Item units become immutable after first stock movement. Money, vendors, purchase orders, conversions, and reservations are excluded.
6. Inventory writes and immutable ledger entries commit together. A request key is scoped to tenant and operation; identical retries return the original outcome, while a reused key with different normalized input returns `CONFLICT`. Concurrency tests use independent committed transactions and connections.
7. Every business mutation records actor, tenant, office where applicable, operation, resource, server timestamp, and sanitized before/after values or a stock movement reference. Do not audit session tokens or unrelated personal data.
8. Lists use bounded pagination, deterministic ordering, and validated search/filter inputs. Pending, empty, failure, denied, archived, and retry states must be usable. Success updates appear only after commit.
9. Staff mutations enforce same-origin/CSRF controls appropriate to their handler. Public preview data remains fictional and has no write path. No production authentication bypass may be introduced for tests.
10. Signed-in workspace data must not leak through shared caches, browser history after logout, or reused organization context. Follow current Next.js/WorkOS documentation at implementation time.

## Permission defaults

Implement capabilities, with initial role-to-capability mapping configured in WorkOS. These names describe intended behavior; they are not evidence that provider roles exist already.

| Role | MVP access |
| --- | --- |
| Organization admin | All offices within its tenant; tenant settings, members, office access, offices, rooms, assignments, inventory, corrections |
| Office manager | Read/manage rooms, assign already-authorized staff to rooms, manage inventory/targets in assigned active offices; cannot grant tenant roles or office access |
| Employee | Read own office/room assignments; no inventory mutation or staff administration |
| Reception/security, office helper | Own assignment view for now; future service capabilities remain deferred |

Explicitly granted capabilities can be combined. QR ordering eligibility is not an MVP administration role. Unknown or absent permissions grant no management access.

## Completion rule

Each contract needs linked acceptance tests, recorded red/green evidence, passing relevant regression tests, working UI, reviewed migration if applicable, updated documentation, and no unresolved high-impact correctness/access defect. Mark a contract complete only with evidence in its completion record.

The MVP is complete when a real administrator and scoped office manager can finish the C11 journey, tenant isolation and stock concurrency tests pass, CI is green, and the deployed environment passes live WorkOS sign-in/out and persistence checks. A local implementation milestone may be reported separately; it must not be called a deployed release.

See [the TDD policy](testing.md) for required evidence and test layers.
