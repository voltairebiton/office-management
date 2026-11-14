# TDD and acceptance policy

Status: required workflow for new MVP work; harness commands below are targets for C00, not commands claimed to exist today.

## Red → green → refactor

For each acceptance criterion:

1. Write a test for the externally observable behavior before changing production behavior. Use the contract ID and criterion number in its name or metadata.
2. Run it and record the meaningful failure. A missing credential, disconnected database, syntax error, or wrong test import is not evidence of a behavioral red test.
3. Implement the smallest complete behavior that passes the test, including transaction and authorization boundaries.
4. Run the targeted test, then the affected regression suite. Refactor while keeping them green.
5. Record test path, red failure reason, green command/result, and commit reference in the contract. For migrations, demonstrate failure against the old schema before applying the new migration to the disposable database.

Do not retrofit a passing test and describe it as test-first. Existing baseline tests are regression evidence. Do not write tests that merely restate JSX, spy on implementation details, or duplicate trivial getters. A linter regression can be fixed against its existing failing rule without inventing a mirror test.

## Layers and tools

- **Unit:** Node's built-in test runner for permission decisions, validation, quantity bounds, shortage calculations, and provider event policies. Use deterministic clocks and IDs where required.
- **Service integration:** Real PostgreSQL 18, real migrations, real constraints and transactions. Fake only external WorkOS responses through an explicit server adapter. Verify persisted state and audit records after success and rejection.
- **Concurrency:** Independent database connections and transactions with synchronization barriers. Cover duplicate submissions, competing transfers, assignment races, and corrections. A single transaction using savepoints cannot establish concurrency correctness.
- **UI/E2E:** Playwright journeys through the production build, browser form input, visible results, navigation, keyboard access, and authorization boundaries. Use a test-only provider boundary or staging users; injected sessions must be available only to the isolated test process and impossible to enable in production. Keep real staging WorkOS sign-in/out as a separate acceptance gate.
- **Static/build:** ESLint and the production Next.js build. Neither replaces behavior tests.

Avoid adding another unit runner unless a concrete test needs it. Follow installed Next.js and current Playwright docs when establishing E2E infrastructure.

## Isolation

C00 must introduce `TEST_DATABASE_URL` and require it for integration/E2E tests. Test commands must never silently fall back to the application `DATABASE_URL`. Use a dedicated local/CI Postgres database; a dedicated Neon test branch is optional. Fail before writes when the configured test target matches the application target. Cleanup must be limited to known fixture IDs or a disposable test database; never truncate the application database.

The existing constraint suite currently uses `DATABASE_URL` and rolls back all fixtures. It was rerun once during the baseline review. Before adding tests that commit or use multiple connections, migrate the suite to the isolated target and provide clear setup instructions. Do not weaken this requirement to get CI green.

CI should use a Postgres 18 service and synthetic fixtures, without requiring production credentials. Provider adapter tests must not send invitations or mutate real accounts. Full WorkOS staging checks use a separately provisioned staging tenant/user.

## Target scripts and CI gates

C00 will introduce or finalize:

| Script | Required behavior |
| --- | --- |
| `npm test` | Fast deterministic unit/service-boundary tests |
| `npm run test:db` | Real integration and constraint tests on explicit isolated database |
| `npm run test:e2e` | Staff and access-denial browser journeys against isolated app/database |
| `npm run lint` | ESLint with no errors |
| `npm run build` | Production build |

CI runs clean install, migrations against a fresh test database, unit tests, database tests, lint, build, and browser acceptance tests. Use the production build for E2E. Never silently skip a required test because credentials are missing; separate optional live provider checks from required deterministic CI checks and show their status explicitly. Store sanitized failure output and browser traces; do not publish tokens or real personal data.

## Mandatory cross-cutting cases

- Two tenants, two offices in one tenant, and users with differing scope. Read and mutate every resource using foreign IDs, forged office filters, and direct requests.
- Missing session, no active organization, inactive membership, revoked office access, archived resource, and unavailable provider/database. Denial leaves no business or audit mutation behind.
- Refresh or retry after a committed write, duplicate requests in flight, duplicate idempotency keys with different input, and failure between intended balance/ledger updates.
- Zero stock, exact depletion, insufficient stock, database integer limits, invalid units, transfer to the same location, and transfers outside the office.
- Pagination/filter consistency; empty tenant; multi-office counts with a person assigned in more than one office; archived entities excluded from active totals.
- Keyboard submission, field-associated validation messages, pending controls, mobile navigation, and readable tables. Use automated accessibility checks where practical, plus focused manual review.

Coverage percentages alone do not establish completion. Every acceptance criterion needs a test or an explicit live acceptance check, with the reason for any manual check documented.

## Baseline review, 14 November 2026

- Existing PostgreSQL constraint suite: 13 tests passed (12 subtests plus parent).
- First lint run: failed on 19 instances of components declared during render in the dashboard. This exposed a gap in the previous build-only validation. The regroup change extracted those components to module scope; the rerun of lint passes. The final production build also passes. All nine preview destinations return HTTP 200 in a production-server render smoke check; this does not claim browser-interaction or real WorkOS acceptance coverage.
- No prior TDD history is claimed. No existing browser acceptance suite or CI workflow was found.
