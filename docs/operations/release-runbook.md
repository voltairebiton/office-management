# Release and operations runbook

This runbook describes the current release path and the checks still required before a real tenant can use the service. The app is not yet deployed; no production URL or production credentials have been selected.

## Environment setup

- Use Node.js 24 LTS (Node.js 22.13 or later is supported) and `npm ci`.
- Copy `.env.example` to `.env.local`. Keep real credentials in the ignored local file or the hosting provider's secret store.
- The local dashboard and approved WorkOS callback use port `3107`. Set the same callback in WorkOS and `NEXT_PUBLIC_WORKOS_REDIRECT_URI`.
- `DATABASE_URL` is the application connection. Use a dedicated, restricted runtime database role.
- `DIRECT_DATABASE_URL` is the direct migration connection. Use the migration owner only in the migration job or an operator shell; do not provide it to the running application.
- `TEST_DATABASE_URL` must point to a disposable database that differs from both application URLs. Test scripts refuse a matching application database and never fall back to it.
- WorkOS client ID, server API key, cookie password, webhook secret, and database credentials are secrets. Never add their values to source, CI output, screenshots, task descriptions, or support diagnostics.

## Local checks

```sh
npm ci
npm run lint
npm test
npm run db:migrate:test
npm run test:db
npm run build
npm run test:e2e
```

The database commands require an explicit isolated `TEST_DATABASE_URL`. CI creates a fresh PostgreSQL 18 service, applies every migration, and runs unit, database, lint, build, and browser checks. Public preview browser tests do not prove authenticated WorkOS behavior.

To work locally, configure `.env.local` and run:

```sh
npm run dev -- --port 3107
```

Do not point a test command at the Neon application database. Use CI or a separate local PostgreSQL database when no isolated test URL is configured.

## WorkOS setup and first administrator

1. Create the staging WorkOS application and configure `http://localhost:3107/auth/callback`, initiate login at `http://localhost:3107/auth/sign-in`, and sign-out at `http://localhost:3107`.
2. Store the staging client ID, server API key, and a generated cookie password privately.
3. Add an organization and assign its initial owner the approved WorkOS administrator role.
4. Apply database migrations, then run `npm run workos:bootstrap-admin` with the verified WorkOS user and organization IDs in the two bootstrap environment variables.
5. Verify sign-in, organization selection, administrator access, organization rename, sign-out, membership revocation, and a scoped office-manager session.
6. Configure a signed webhook endpoint for organization membership created, updated, and deleted events; record and verify real delivery.

Bootstrap is explicit and limited to the first local organization administrator. Normal login does not promote anyone.

## Migration and recovery procedure

1. Review generated migration SQL and its Drizzle journal entry. Check tenant foreign keys, unique indexes, audit behavior, and lock/scan costs against a disposable PostgreSQL database.
2. Run the full CI suite from a clean migration state. Do not apply a schema change to the production Neon project from a developer checkout.
3. Before deployment, take a provider-supported recoverable database backup or point-in-time restore marker, and record the current migration version.
4. Apply pending migrations with the migration-owner URL in a one-shot deployment step. Start the new app version only after migration success.
5. Verify sign-in, tenant/office scope, representative stock balances and movement history, and the health route or app page.
6. If data or migration behavior is wrong, stop writes and restore to a new isolated database first. Reconcile its migration version and balances before planning any production cutover. Prefer a reviewed forward-fix migration when safe; do not assume reverting application code reverses a schema change.
7. Rehearse the chosen provider's backup restore and migration recovery on a disposable environment before calling C11 complete.

Exact backup retention, point-in-time recovery availability, and restore timing depend on the Neon plan and must be verified in the account selected for release.

## Runtime database and tenant isolation

- `DATABASE_URL` and `DIRECT_DATABASE_URL` are separate configuration points so the runtime and migration roles can differ. Production role grants have not yet been configured or audited.
- Application services scope reads and writes to the verified local organization and authorized active office IDs. PostgreSQL row-level security is not configured; service-level authorization is the current isolation boundary.
- Before release, verify runtime grants using a disposable production-like database: runtime can perform only required application operations; migration owner alone can create or alter schema.
- Never run migration commands with runtime credentials if the host offers a one-shot migration job.

## Safe diagnostics

- User-facing failures use stable error categories and safe retry instructions. Database/provider details are not returned to staff.
- When investigating an issue, record the deployment version, migration version, sanitized operation, and a request/correlation ID if available. Do not include connection URLs, API keys, webhook signatures, cookies, session tokens, or unrelated personal data.
- Planned visitor and QR refreshment workflows remain non-operational and must stay labeled as planned until their own contracts are implemented and accepted.

## Release gates still open

- Select and configure a Next.js-compatible hosting provider and production domain.
- Create production WorkOS callback, sign-out, login, and signed-webhook URLs; verify with real admin and manager accounts.
- Create and audit separate runtime and migration database roles.
- Rehearse backup restore, migration recovery, membership revocation, and the complete C11 journey.
- Record deployed URL, commit, migration version, live acceptance date, and limitations only after those checks pass.
