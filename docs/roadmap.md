# Implementation roadmap

## Foundation in this commit

- One Next.js application written in JavaScript.
- MIT license and a reproducible npm lockfile.
- Responsive public home and staff dashboard shell.
- WorkOS sign-in/callback/sign-out wiring, configuration checks, and server-side organization guard.
- The agreed domain model.

## Next usable milestone: offices and room inventory

Use Neon PostgreSQL, choose the ORM, and add the initial migrations. Then implement these as complete workflows:

1. Organization/member projections and office-scoped permissions.
2. Office and room creation, editing, and archiving.
3. Employee room assignments and assigned headcounts.
4. Item catalog, stock locations, receipts, and auditable movements.
5. Room requirements, deployments, and shortage visibility.

This milestone should provide a useful inventory workflow before adding the remaining service features. All business relationships must enforce tenant consistency. The session guard supplies organization context, while the persistence layer must enforce its use.

## Further features

- Visitor registration, host assignment, check-in, and checkout.
- Refreshment menus and desk QR issuance/revocation.
- Visitor QR ordering tied to checked-in visits.
- Helper order queues, claiming, preparation, delivery, and notifications.
- Inventory deductions from menu items or recipes.
- Inter-office stock transfers.
- Headcount-based room replenishment rules.
- Attendance or daily room presence.
- Individually tagged equipment.

The QR and order models are documented, but no public QR endpoint exists in the foundation. QR possession will authorize only its limited ordering flow; staff operations use WorkOS authentication.

Select future tasks based on actual needs as the project is used. The scope and acceptance criteria for each implementation should be written when the task is selected.
