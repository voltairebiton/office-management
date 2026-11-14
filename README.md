# Office Management

A personal, MIT-licensed office management project built with Next.js and JavaScript. One application will support multiple organizations, each with offices and rooms.

## Current foundation

- Next.js App Router, React, JavaScript, Tailwind CSS, and ESLint.
- Public home page, administrator setup page, and staff dashboard shell.
- WorkOS AuthKit sign-in, callback, sign-out, and session integration.
- Server helpers requiring a signed-in user and an active organization context.
- Neon PostgreSQL connection, Drizzle ORM, and a versioned migration for seven foundation tables.
- Live database constraint tests that roll back their fixtures.
- Responsive layouts and explicit planned states for future office modules.

The app runs without credentials so contributors can view the starter. Staff pages redirect to setup until authentication is configured. There is no authentication bypass or demo staff account.

The database foundation is implemented. Office CRUD, WorkOS synchronization, office-level permission services, visitor management, inventory, QR ordering, and notifications remain planned. The dashboard is a shell and displays no fabricated operational data.

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
5. Add the application's client ID to `.env.local` as `WORKOS_CLIENT_ID`.
6. Generate a cookie password with `openssl rand -base64 32` and put it in `.env.local` as `WORKOS_COOKIE_PASSWORD`.
7. Create an organization, invite your user, and sign in with that organization's context to access `/dashboard`.

`NEXT_PUBLIC_WORKOS_REDIRECT_URI` must match the callback URL in WorkOS. Client ID, cookie password, and redirect URI are required. `WORKOS_API_KEY` is optional for the current sign-in flow; future server-side organization management will need it. Keep real credentials in `.env.local`, which Git ignores. Configure these values before building for production, including the production callback URL.

A signed-in user without organization context is sent to `/workspace-required`. The schema includes local organization and membership records; provisioning, WorkOS synchronization, organization switching, and office permission services remain planned. `requireOrganization()` returns the verified `workosOrganizationId`. Resolve that provider ID to the local organization UUID before querying tenant records. Tenant and office relationships must also be enforced in the database.

Authentication wiring requires a real WorkOS environment for an end-to-end sign-in check. A successful build alone does not verify an external sign-in flow.

## Database

The database uses **PostgreSQL hosted on Neon**, with **Drizzle ORM** and the `pg` driver.

Put the pooled Neon connection string in `.env.local` as `DATABASE_URL`, and the direct connection string as `DIRECT_DATABASE_URL` for migrations. These variables stay on the server. The connection is created only when requested, so building or viewing the public starter requires no database credentials.

```sh
npm run db:migrate
npm run db:check
npm run test:db
```

The first migration creates users, organizations, memberships, offices, rooms, office access records, and room assignments. Business records share the database and are scoped by the local organization UUID. See [database setup and constraints](docs/database.md).

See [Neon's pricing](https://neon.com/pricing) for current free-plan allowances.

## Commands

| Command         | Purpose                    |
| --------------- | -------------------------- |
| `npm run dev`   | Start local development.   |
| `npm run lint`  | Run ESLint.                |
| `npm run build` | Create a production build. |
| `npm start`     | Run the production build.  |

The scoped `minimatch` override keeps the ESLint parser dependency on a patched release while its upstream range remains on version 10. The scoped `esbuild` override patches the legacy loader used by Drizzle Kit. Both apply to development tooling.

## Structure

```text
src/
  app/
    auth/               Sign-in and callback route handlers
    dashboard/          Organization-protected staff shell
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
