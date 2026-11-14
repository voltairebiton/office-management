# C00 — Test foundation and CI

Status: In progress. Dependencies: None.

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
5. Each later contract has a completion record linking red failure, green result, and relevant regression evidence.
6. Unit, database integration, and browser acceptance scripts run locally. CI applies fresh migrations and executes each required suite against an isolated PostgreSQL service. Test and trace outputs are sanitized.

## TDD sequence and evidence

- Write failing configuration-guard tests before adding TEST_DATABASE_URL handling.
- Prove a migration from an empty disposable database and a real rollback fixture.
- Use a two-connection database smoke case to establish the harness; test product races in C04/C06/C07/C08.
- Validate the CI configuration with an actual run. Do not leave intentional failures on main.

## Boundaries and dependencies

No new business features. No production data resets. Do not make a percentage-coverage target the acceptance substitute.

## Completion record

- [ ] Acceptance tests written first; meaningful red failures recorded.
- [ ] Test database isolation and guard complete.
- [ ] Unit, integration and E2E suites run in the documented order.
- [ ] CI run is green.
- [ ] Documentation and setup instructions updated; test output contains no credentials.

| Criterion | Test/check path | Red failure or live-check prerequisite | Green result | Commit/evidence |
| --- | --- | --- | --- | --- |
| Database target resolver | `tests/unit/test-database-config.test.js` | Before guard: 5 safety behaviors failed against a stub that fell back to the application URL. | `npm test`: 8 assertions passed. | Local `green`; red output sanitized and summarized here. |
| Public/auth-setup/mobile UI | `tests/e2e/access-and-preview.spec.js` | Initial run exposed three incorrect locators, corrected to the accessible setup heading and scoped office content. | `npm run test:e2e`: 5 browser tests pass locally and in CI. | [CI run 43610082972](https://github.com/voltairebiton/office-management/actions/runs/43610082972). |
| GitHub workflow | `.github/workflows/ci.yml` | First push recorded a failed run with zero jobs and no logs. The PostgreSQL mapped port expression was moved from job-level to step-level environment, and manual dispatch was added. | Fresh migration, tests, lint, build, and E2E all passed in CI; two-connection smoke was added afterward. | [CI run 43610082972](https://github.com/voltairebiton/office-management/actions/runs/43610082972); [initial run 43607649296](https://github.com/voltairebiton/office-management/actions/runs/43607649296) had no job logs. |
| Committed fixtures across connections | `tests/connections-database.test.js` | Added after C00's first green run to prove a committed row is visible on an independent connection and deleted by fixture ID. | Fresh PostgreSQL migrations and the two-connection test pass in CI. | [CI run 43613705365](https://github.com/voltairebiton/office-management/actions/runs/43613705365); uses only `TEST_DATABASE_URL`. |

Do not mark complete based on a UI screenshot, a build alone, or mocked provider success alone.
