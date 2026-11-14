# C00 — Test foundation and CI

Status: Open. Dependencies: None.

## User outcome

A contributor can prove changes against an isolated database and repeat the same checks in CI.

## Deliverables

- Extend the existing Node test runner; add fixtures, a WorkOS adapter seam, and browser acceptance infrastructure.
- Introduce explicit test database configuration and fresh-schema migration commands.
- Configure repository CI and document local commands. Keep production credentials out of CI.
- Fix baseline static-check failures without disabling their rules.

## Acceptance criteria

Label tests `C00-AC1`, `C00-AC2`, etc., matching the numbered criteria below. Shared authorization, audit, validation, and idempotency requirements in the [MVP plan](../README.md) also apply.

1. Missing or unsafe test database configuration fails before writes; there is no application-database fallback. A separate database migrates from empty and can be recreated without touching application data.
2. Existing constraint tests pass on the isolated database and leave no fixture data. Multi-connection tests can commit and reliably clean up their own fixtures.
3. Unit tests can supply deterministic external-provider outcomes. Production code cannot activate a test session from a request header, cookie, query parameter, or public environment variable.
4. CI checks install, migrations, tests, lint, build, and E2E on pull requests. A deliberate failing assertion makes the appropriate job fail.
5. Each later contract has a completion record linking red failure, green result, and relevant regression evidence. Test and trace outputs are sanitized.

## TDD sequence and evidence

- Write failing configuration-guard tests before adding TEST_DATABASE_URL handling.
- Prove a migration from an empty disposable database and a real rollback fixture.
- Use a two-connection database smoke case to establish the harness; test product races in C04/C06/C07/C08.
- Validate the CI configuration with an actual run. Do not leave intentional failures on main.

## Boundaries and dependencies

No new business features. No production data resets. Do not make a percentage-coverage target the acceptance substitute.

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
