# Implementation roadmap

The [MVP contract index](mvp/README.md) is the source of truth for scope, dependencies, acceptance criteria, and [TDD evidence](mvp/testing.md). Implementation has progressed through C07; C08 stock corrections are in progress. C01–C07 PostgreSQL suites pass in CI. Authenticated WorkOS acceptance and C09–C11 remain.

## Implemented workflow slices

- Multi-tenant WorkOS identity projection, guarded first-admin bootstrap, tenant and office authorization.
- Office and room management, staff office access, and room assignments.
- Shared catalog and office stock locations.
- Audited stock receipts, room deployment, returns, consumption, damage, and count corrections.
- Responsive dashboard shell with grouped sidebar navigation.

## Remaining MVP work

- Finish C08 and add room supply targets and shortage visibility in C09.
- Connect real inventory and staffing information to the dashboard in C10.
- Complete C11 release readiness: end-to-end staff journeys, staging WorkOS sign-in/out and webhooks, deployment configuration, and operator documentation.
- Deliver the already-scoped visitor registration and QR-based refreshment ordering workflow with helper notifications if it remains within the accepted MVP boundary; finalize its acceptance contract before implementation.

Attendance, automatic recipe deductions, inter-office transfers, headcount-based replenishment, and individually tagged equipment remain outside the current release.
