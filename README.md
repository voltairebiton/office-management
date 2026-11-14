# Office Management

A personal, MIT-licensed office management project built with Next.js and JavaScript. One application will support multiple organizations, each with offices and rooms.

## Current foundation

- Next.js App Router, React, JavaScript, Tailwind CSS, and ESLint.
- Public home page, administrator setup page, and responsive staff dashboard with grouped sidebar navigation.
- WorkOS AuthKit sign-in, callback, sign-out, and session integration.
- Server helpers requiring a signed-in user and an active organization context.
- Neon PostgreSQL connection, Drizzle ORM, and versioned migrations for identity, offices, people, inventory, and immutable stock history.
- PostgreSQL integration coverage for tenant and office scope, room assignments, catalog, receipts, deployments, returns, and stock corrections.
- Office filters, searchable sample lists, mobile navigation, and explicit planned states for future office modules.
- Public `/preview` design preview with clearly labelled fictional data; no database access or mutations.

The app runs without credentials so contributors can view the starter. Staff pages redirect to setup until authentication is configured. There is no authentication bypass or demo staff account.

Organization identity, office and room management, staff access and room assignments, the catalog, stock receipts, office-local deployments and returns, and reasoned consumption/damage/count corrections are implemented. Their PostgreSQL acceptance suites run in CI; contracts also track the remaining live authenticated browser acceptance. Visitor management, desk and visitor QR ordering, office-helper queues/notifications, and release hosting remain future MVP work. Real WorkOS sign-in, server API access, webhook delivery, and first-admin bootstrap still need staging credentials and acceptance. The separate `/preview` route demonstrates the interface using fictional records. See [interface design and scope](docs/design.md).

## MVP execution plan

See the [MVP status and contract index](docs/mvp/README.md) for the complete scope, dependencies, and twelve implementation contracts. New MVP work follows the [TDD policy](docs/mvp/testing.md): behavior tests first, then implementation, regression checks, and recorded completion evidence.

## Local development

Use Node.js 24 LTS (recommended; see `.nvmrc`) and npm. Node.js 22.13 or newer is supported.

```sh
npm ci
cp -n .env.example .env.local
npm run dev
```

Open [localhost:3000](http://localhost:3000). Configuration can be added after starting the app; restart the server after changing environment variables.

## WorkOS setup

1. Create a WorkOS application with AuthKit enabled.
2. Set the redirect URI to `http://localhost:3000/auth/callback`.
3. Set the initiate login URI to `http://localhost:3000/auth/sign-in`.
4. Set the default sign-out URI to `http://localhost:3000`.
5. Add the application's client ID and server API key to `.env.local` as `WORKOS_CLIENT_ID` and `WORKOS_API_KEY`.
6. Generate a cookie password with `openssl rand -base64 32` and put it in `.env.local` as `WORKOS_COOKIE_PASSWORD`.
7. Add the application database URL, run `npm run db:migrate`, and restart the development server.
8. Create an organization, assign your user a WorkOS organization role with slug `admin` or `organization_admin`, then set `BOOTSTRAP_WORKOS_USER_ID` and `BOOTSTRAP_WORKOS_ORGANIZATION_ID` in `.env.local` and run `npm run workos:bootstrap-admin`.

`NEXT_PUBLIC_WORKOS_REDIRECT_URI` must match the callback URL in WorkOS. Client ID, server API key, cookie password, redirect URI, and application database URL are required for staff access. Keep real credentials in `.env.local`, which Git ignores. Configure these values before building for production, including the production callback URL.

After choosing a public HTTPS host, configure a WorkOS webhook for `organization_membership.created`, `organization_membership.updated`, and `organization_membership.deleted` at `/api/webhooks/workos`. Save its signing secret as `WORKOS_WEBHOOK_SECRET`; the endpoint verifies signatures and reconciles current provider state before committing event IDs.

A signed-in user without organization context is sent to `/workspace-required`. Every protected organization request now fetches the user, organization, and active membership from WorkOS and transactionally upserts their local projections. It fails closed when the provider or database is unavailable. The bootstrap command verifies the WorkOS membership and administrator role before granting the first local organization admin; normal login never promotes a user. Organization switching, webhook delivery, and office permission services remain in progress.

Authentication wiring requires a real WorkOS environment for an end-to-end sign-in check. A successful build alone does not verify an external sign-in flow.

## Database

The database uses **PostgreSQL hosted on Neon**, with **Drizzle ORM** and the `pg` driver.

Put the pooled Neon connection string in `.env.local` as `DATABASE_URL`, and the direct connection string as `DIRECT_DATABASE_URL` for migrations. These variables stay on the server. The connection is created only when requested, so building or viewing the public starter requires no database credentials.

```sh
npm run db:migrate
npm run db:check
npm run test
npm run db:migrate:test
npm run test:db
npm run test:e2e
```

The foundation migration creates users, organizations, memberships, offices, rooms, office access records, and room assignments. The next migration adds processed WorkOS webhook event IDs for idempotent delivery. Business records share the database and are scoped by the local organization UUID. See [database setup and constraints](docs/database.md).

See [Neon's pricing](https://neon.com/pricing) for current free-plan allowances.

## Commands

| Command         | Purpose                    |
| --------------- | -------------------------- |
| `npm run dev`   | Start local development.   |
| `npm run lint`  | Run ESLint.                |
| `npm run build` | Create a production build. |
| `npm test` | Run deterministic unit tests. |
| `npm run db:migrate:test` | Migrate only the isolated test database. |
| `npm run test:db` | Run PostgreSQL integration tests against that database. |
| `npm run test:e2e` | Run Chromium browser acceptance tests against the production build. |
| `npm run workos:bootstrap-admin` | Verify an existing WorkOS administrator and grant the first local tenant admin. |
| `npm start`     | Run the production build.  |

The scoped `minimatch` override keeps the ESLint parser dependency on a patched release while its upstream range remains on version 10. The scoped `esbuild` override patches the legacy loader used by Drizzle Kit. Both apply to development tooling.

## Structure

```text
src/
  app/
    auth/               Sign-in and callback route handlers
    dashboard/          Organization-protected staff workspace
    preview/            Public design preview with fictional fixtures
    setup/              Configuration instructions
    workspace-required/ Signed-in users without organization context
    actions.js          Staff sign-out action
  db/                   Schema, connection factory, and server-only database accessor
  components/           Shared UI
  lib/
    auth-config.js      Authentication configuration checks
    auth.js             Server-only user and organization guards
    modules.js          Descriptions of planned modules
  proxy.js              WorkOS session proxy

drizzle/                Versioned SQL migrations and schema snapshots
scripts/                Database migration and verification commands
tests/                  Live database constraint tests

docs/
  design.md              Palette, navigation, and preview boundaries
  database.md            Database setup and implementation boundary
  domain-model.md        Agreed model and proposed workflow details
  roadmap.md             Implementation order and future work
```

## Planned workflows

- Organizations own multiple offices; offices contain rooms.
- Employees have assigned rooms. Attendance is a future feature.
- Inventory starts with quantities. Room targets and deployed stock expose shortages.
- Eligible managers receive reusable desk QR codes and order without signing in.
- Visitors scan QR codes to order without accounts. The proposed model binds each visitor code to a visit and expires it at checkout.
- Office helpers receive notifications and prepare/deliver orders.
- Staff management and fulfillment use authenticated, office-scoped access.

See [the domain model](docs/domain-model.md) and [the roadmap](docs/roadmap.md). Neon PostgreSQL and Drizzle ORM provide the database foundation.

## References

- [Next.js App Router](https://nextjs.org/docs/app)
- [WorkOS AuthKit Next.js SDK](https://github.com/workos/authkit-nextjs)

## License

[MIT](LICENSE). Dependency licenses apply to their respective packages.
