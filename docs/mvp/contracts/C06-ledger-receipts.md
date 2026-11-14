# C06 — Stock ledger, balances, and receipts

Status: Open. Dependencies: C05.

## User outcome

Receiving stock updates available quantity exactly once and leaves an auditable immutable record.

## Deliverables

- Add inventory balances, immutable movements/entries, request-idempotency records, and audit integration.
- Receipt form/service, balance queries, movement history with stable pagination.
- Establish the transaction/locking primitive reused by transfers and corrections.

## Acceptance criteria

Label tests `C06-AC1`, `C06-AC2`, etc., matching the numbered criteria below. Shared authorization, audit, validation, and idempotency requirements in the [MVP plan](../README.md) also apply.

1. Receive a positive bounded integer quantity for an active item into an active authorized storeroom/pantry in one office. Opening stock uses an explicit opening receipt reason. Direct initial room stock is excluded; deploy from storage.
2. Receipt creates movement entries and increases the location balance in one transaction. Database failure at any step leaves neither partial balance nor partial ledger changes.
3. Each movement stores tenant, office, actor, item/unit snapshot, locations, positive quantity/delta as applicable, type, reason/reference, server time, and request identity. Movement history is append-only.
4. Identical idempotency key plus normalized payload returns the original result, including simultaneous duplicate requests. A different payload with that key conflicts; no second receipt occurs.
5. Concurrency cannot lose stock updates or create duplicate balance rows. Integer overflow is rejected before a partially committed ledger.
6. Every balance can be reconciled to its ledger sum. Receipts cannot target archived or foreign-scope resources, including when archival races a write. Complete the C03/C05 extension here: block office/room/item/location archival while stock remains, and lock SKU/category/base-unit identity after the first movement.
7. All successful and rejected states are reflected accurately in the form; network retries reuse the original request key until resolved. New intentional receipts use new keys.

## TDD sequence and evidence

- Start with failing ledger-sum and atomic rollback tests on real Postgres.
- Two-connection tests: simultaneous first receipts, concurrent increments, and duplicate same-key submissions.
- Red tests for reused-key mismatch, max quantity, invalid location, scope denial, and archival races.
- Browser journey receives stock, retries submission, reloads, and sees one receipt and the correct balance.

## Boundaries and dependencies

No negative receipts, direct balance editing, or removal of ledger history. Corrections use C08.

## Completion record

- [ ] Acceptance tests written first; meaningful red failures recorded.
- [ ] Implementation and relevant UI complete.
- [ ] Acceptance and regression checks pass; required migrations reviewed/applied to test environment.
- [ ] Authorization and failure behavior verified; documentation updated.
- [ ] Evidence added below; all dependencies complete.

| Criterion | Test/check path | Red failure or live-check prerequisite | Green result | Commit/evidence |
| --- | --- | --- | --- | --- |
| C06-AC1 / AC4 / AC7 | `tests/unit/ledger-validation.test.js`, `tests/unit/receipt-draft.test.js` | The receipt-draft behavior tests first ran against inert stub functions: valid retry persistence returned false and malformed draft cleanup left invalid storage behind. This was a behavioral red. | Receipt quantity/reason normalization and four retry-draft cases pass; overall `npm test` passes 86 assertions. | Local implementation; commit and CI evidence pending. |
| C06-AC1–AC6 | `tests/stock-ledger-database.test.js`, `drizzle/0006_breezy_killer_shrike.sql` | Local isolated PostgreSQL is not configured; the application database was not used. Fresh-migration, rollback, scope, immutable-ledger, archive-blocker, overflow, and two-connection checks are queued for disposable CI PostgreSQL. | Pending CI. | Pending. |
| C06-AC7 UI | `src/components/catalog-forms.js`, `src/components/catalog-workspace.js`, `tests/e2e/access-and-preview.spec.js` | Authenticated receipt journey requires the configured WorkOS staging credentials. | Form, balance list, movement history, and persisted retry handling compile; production build and existing browser smoke suite pass locally (5/5). | Pending authenticated browser acceptance. |

Do not mark complete based on a UI screenshot, a build alone, or mocked provider success alone.
