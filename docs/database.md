# Database foundation

The application uses Neon PostgreSQL, Drizzle ORM, and the `pg` driver in the Node.js runtime. Schema and tooling are written in JavaScript.

## Connect a development environment

1. Copy `.env.example` to `.env.local` if that file does not already exist.
2. Set `DATABASE_URL` to the pooled Neon connection string.
3. Set `DIRECT_DATABASE_URL` to the direct connection string for migrations. When omitted, migrations use `DATABASE_URL`.
4. Run `npm run db:migrate`, then `npm run db:check`.

Connection strings are server credentials. `.env.local` is ignored by Git and must stay out of public snapshots. The application connection factory preserves certificate verification by translating Neon's `sslmode=require` to the explicit `verify-full` mode supported by `pg`.

The server accessor is `getDatabase()` from `src/db/index.js`, which imports `server-only`. It creates a pool on first use and reuses it across requests and development reloads. Public page rendering and production builds do not contact the database. CLI commands use the connection factory directly and close their pools when finished.

## Isolated test database

Integration tests require `TEST_DATABASE_URL` set to a PostgreSQL database dedicated to tests. Never copy `DATABASE_URL` or `DIRECT_DATABASE_URL` into it. The migration and test commands check the endpoint and database name against both application URLs, refuse a match, and never fall back to either application variable. The check cannot detect two hostnames that alias the same underlying database; use a dedicated local database, PostgreSQL service, or Neon branch.

```sh
npm test
npm run db:migrate:test
npm run test:db
```

`npm test` is independent of PostgreSQL. `db:migrate:test` migrates only `TEST_DATABASE_URL`. `test:db` fails before connecting if that explicit URL is missing. CI uses a fresh PostgreSQL service for each run.

## Commands

| Command               | Purpose                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run db:generate` | Generate a versioned SQL migration after changing the JavaScript schema. Review the SQL before applying it. |
| `npm run db:migrate`  | Apply pending migrations with Drizzle's migration journal. Re-running does not recreate tables.             |
| `npm run db:check`    | Verify the application connection and the seven foundation tables.                                          |
| `npm test`             | Run deterministic unit tests without a database.                                                     |
| `npm run db:migrate:test` | Apply migrations only to `TEST_DATABASE_URL`.                                                     |
| `npm run test:db`       | Verify database constraints using synthetic records in one rolled-back transaction on test DB.       |
| `npm run test:e2e`      | Run browser acceptance tests against the production build.                                            |

The tests require a reachable migrated database. They do not leave fixture records behind. They check real foreign keys and uniqueness constraints; they do not verify WorkOS sign-in or authorization services that have not been implemented.

## First migration

| Table                      | Responsibility                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `users`                    | Local references to WorkOS users.                                                             |
| `organizations`            | Local tenant records, keyed separately from WorkOS organization IDs.                          |
| `organization_memberships` | Local membership projections; default status is pending and the role is unset.                |
| `offices`                  | Tenant-owned physical offices with unique office codes per tenant.                            |
| `office_assignments`       | Membership-to-office access records, with an active flag.                                     |
| `rooms`                    | Rooms belonging to an office, with unique codes per office and optional nonnegative capacity. |
| `room_assignments`         | Employee assignments with start/end times and retained history.                               |

Composite foreign keys enforce matching organizations on office access and rooms. Room assignments reference both the employee's office access record and a room in that same office. A partial unique index permits one active assigned room per member per office, while allowing historical assignments and assignments in multiple offices.

Office access records are deactivated rather than deleted when history refers to them. Database foreign keys ensure the records exist; service operations must additionally check active membership, active office access, active locations, and the actor's permissions when creating or changing assignments.

## Tenant context and authorization

WorkOS organization IDs and local organization UUIDs are different values. `requireOrganization()` returns the verified provider ID as `workosOrganizationId`. Future services must resolve it to an active local organization row and scope all subsequent reads and writes to that row's UUID. Browser-supplied tenant IDs are not an access check.

Foreign keys protect relationships; they do not authorize reads. There is no general public database endpoint. Row-level security policies and a restricted application database role are not configured in this foundation; tenant-scoped services and authorization checks must be implemented before exposing business data through application routes.

WorkOS remains authoritative for staff access. The presence of a local membership row cannot independently authorize a request. WorkOS event synchronization, staff onboarding, organization switching, and office management UI remain future work. The dashboard currently does not query or modify business records.

## Further schema work

Inventory balances and movements, room stock requirements, visitors, QR credentials, refreshment orders, and notifications will get their own reviewed migrations when those features are implemented. Attendance remains deferred.

## References

- [Drizzle PostgreSQL integration](https://orm.drizzle.team/docs/get-started-postgresql)
- [Drizzle migrations](https://orm.drizzle.team/docs/migrations)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
