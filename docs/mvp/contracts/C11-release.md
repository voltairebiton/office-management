# C11 — MVP acceptance and release readiness

Status: Open; local release documentation is in place, but staging and production acceptance require external setup. Dependencies: C00–C10.

## User outcome

A real tenant can run the office inventory workflow in a deployed application with repeatable checks and recoverable operations.

## Deliverables

- Complete integrated acceptance and access/concurrency regression suites.
- Choose/configure hosting, production application secrets and exact callback/sign-out/webhook URLs.
- Document tenant bootstrap, migration/rollback approach, backup/restore, support diagnostics, and local contributor setup.
- Configure a restricted application database role distinct from the migration owner; document any RLS decisions.
- Record release evidence and unresolved limitations.

## Acceptance criteria

Label tests `C11-AC1`, `C11-AC2`, etc., matching the numbered criteria below. Shared authorization, audit, validation, and idempotency requirements in the [MVP plan](../README.md) also apply.

1. A clean checkout can install, create an isolated test database, apply migrations, and run all required CI checks using documented commands. No secret is committed or printed in normal logs.
2. A real staging admin signs in, selects/bootstrap an organization, creates two offices and rooms, provisions member access, and assigns employees. A scoped manager can operate only in the assigned office.
3. The admin/manager creates a catalog item, receives stock, sets room targets, deploys/returns stock, records consumption/count corrections, and sees correct balances, shortages, and immutable history after refresh and a new session.
4. A second tenant and an unauthorized office/user cannot read or mutate these resources through UI, filters, direct requests, or reused session context. Membership revocation and sign-out deny subsequent access.
5. Integration tests prove concurrent requests never duplicate receipt/transfer effects, overspend stock, or leave partial history. Required unit, database, browser, lint, and build checks are green; no skipped required gate is reported as passed.
6. Deployed WorkOS sign-in/out and signed webhooks work with real configured URLs. Runtime database credentials have only needed application privileges; migration-owner credentials are not exposed to the app runtime.
7. Logs identify failed operations using safe request IDs without credentials or unrelated personal data. User-visible failures offer safe retry paths. Database/provider downtime is handled without false success.
8. Migration recovery and backup restoration are rehearsed on a disposable environment. Production rollback is planned per migration; reverting application code alone is not treated as schema rollback.
9. A release record links contract completion evidence, commit, deployed URL, migration versions, live acceptance date, and known limitations. Planned visitor/refreshment features remain honestly marked.

## TDD sequence and evidence

- Start integration of each final journey with a failing browser acceptance test before filling the missing connection.
- Run the full deterministic CI suite once against the release candidate; rerun affected checks only after changes.
- Perform real-provider checks with staging identities and a separate release environment.
- Rehearse deployment, migration recovery, and restore on disposable resources; report deployed release separately from local MVP completion.

## Boundaries and dependencies

Hosting/account credentials and real-user acceptance are release dependencies. No paid plan purchase, real invitations, or production data reset is implied by this planning contract.

The operator procedure is documented in [the release runbook](../../operations/release-runbook.md). It intentionally leaves host selection, production URL configuration, restricted database role grants, and restore rehearsal as explicit open gates.

## Completion record

- [ ] Acceptance tests written first; meaningful red failures recorded.
- [ ] Implementation and relevant UI complete.
- [ ] Acceptance and regression checks pass; required migrations reviewed/applied to test environment.
- [ ] Authorization and failure behavior verified; documentation updated.
- [ ] Evidence added below; all dependencies complete.

| Criterion | Test/check path | Red failure or live-check prerequisite | Green result | Commit/evidence |
| --- | --- | --- | --- | --- |
| AC1 | README.md; docs/database.md; docs/operations/release-runbook.md; .github/workflows/ci.yml | Full corrected C09/C10 PostgreSQL CI run is pending. Local isolated `TEST_DATABASE_URL` is unavailable. | Clean CI installs dependencies, migrates its disposable PostgreSQL 18 service, and runs unit, database, lint, build, and browser checks. Runbook documents separate test/application/migration URLs and sanitized setup. | Working tree; CI pending |
| AC2–AC4, AC6 | tests/workspace-overview-database.test.js; C01–C10 database suites | Requires real staging WorkOS credentials, signed webhook endpoint, a staging administrator and manager, hosting URLs, and separate runtime/migration roles. | Service tests cover scoped queries, role checks, audit, stale updates, and database failure; real sign-in, revocation, deployment, and runtime-grant behavior remain unverified. | External staging/release gate |
| AC5 | npm test; npm run test:db; npm run lint; npm run build; npm run test:e2e | C09/C10 CI rerun pending. | Latest local checks: 111 unit assertions pass, lint/build pass, and all five anonymous/mobile browser checks pass, including office filter URL/back behavior. These do not replace database CI or an authenticated browser run. | Working tree; CI pending |
| AC7–AC9 | docs/operations/release-runbook.md | Hosting and account selection are not complete; backup/restore has not been rehearsed. | Safe diagnostic and recovery procedure is documented. No deployed URL, release migration version, restore evidence, or live acceptance date is claimed. | Release remains open |

Do not mark complete based on a UI screenshot, a build alone, or mocked provider success alone.
