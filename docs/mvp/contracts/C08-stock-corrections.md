# C08 — Consumption, damage, and stock-count corrections

Status: Implementation in progress; awaiting PostgreSQL CI. Dependencies: C06.

## User outcome

Teams can record used supplies and correct physical counts without rewriting history.

## Deliverables

- Record consumable usage and explicit damage/loss adjustments at an authorized location.
- Physical stock-count correction with required reason and expected balance version.
- Correction/usage UI and movement history; all changes use the shared transactional ledger.

## Acceptance criteria

Label tests `C08-AC1`, `C08-AC2`, etc., matching the numbered criteria below. Shared authorization, audit, validation, and idempotency requirements in the [MVP plan](../README.md) also apply.

1. Consumption reduces a consumable item by a positive quantity at the selected office location; it cannot consume reusable furniture. Damage/loss is a separate reasoned operation available to inventory managers.
2. Reductions cannot exceed available stock. Physical counted quantity is a nonnegative bounded integer. The service computes the adjustment from authoritative current balance.
3. Count corrections require a nonempty reason and the balance version observed when counting. If any movement intervenes, return CONFLICT and require review; never silently overwrite it.
4. Ledger entries record count before, count after, computed delta, actor, reason, and time. A zero-delta confirmation produces an audit record without a fictitious stock movement.
5. Retries are idempotent, concurrency cannot make stock negative, and injected failure rolls back balance/ledger/request state together.
6. Quantity history remains immutable. Reversing a mistake creates a new authorized correction with reference to the original movement; it never edits/deletes the old entry.
7. Current room shortage queries reflect consumption/corrections after commit; no automatic purchase/order is created.

## TDD sequence and evidence

- Red tests for reusable-item consumption, insufficient stock, stale counted versions, blank reasons, and zero-delta counts.
- Two connections race a transfer against a physical-count correction and race multiple reductions.
- Integration tests reconcile ledger sums after a correction and its reversal.
- Browser journey consumes tissues, observes the reduced deployed quantity, and records a reasoned physical count.

## Boundaries and dependencies

No automatic recipe/order deduction, approval chains, financial valuation, or scheduled physical-count campaigns.

## Completion record

- [ ] Acceptance tests written first; meaningful red failures recorded.
- [ ] Implementation and relevant UI complete.
- [ ] Acceptance and regression checks pass; required migrations reviewed/applied to test environment.
- [ ] Authorization and failure behavior verified; documentation updated.
- [ ] Evidence added below; all dependencies complete.

| Criterion | Test/check path | Red failure or live-check prerequisite | Green result | Commit/evidence |
| --- | --- | --- | --- | --- |
| AC1–AC3 | tests/unit/adjustment-validation.test.js; tests/adjustments-database.test.js | Unit acceptance tests failed against the initial service/normalizer stubs; blank reason, reusable consumption, and stale count version are rejected. | Validation and PostgreSQL assertions pass in CI run [43624751047](https://github.com/voltairebiton/office-management/actions/runs/43624751047), including the corrected reversal history projection. | d7d7f6b; C08 database checks green |
| AC2–AC5 | tests/adjustments-database.test.js | Local isolated TEST_DATABASE_URL is not configured. | Service serializes stock writes by office, checks nonnegative quantity and observed count version, and rolls back injected failures. | d7d7f6b; C08 database checks green |
| AC4, AC6 | tests/unit/adjustment-draft.test.js; tests/adjustments-database.test.js | Pending-draft tests failed against the initial inert persistence helper. | Retry key and count version survive reload; zero-delta count stores a transaction snapshot and audit event without a movement; reversal links a new movement to immutable history. | d7d7f6b; C08 database checks green |
| UI | src/components/catalog-workspace.js; src/components/catalog-forms.js | Live WorkOS browser journey requires valid staging credentials and a signed-in organization user. | Forms support consumption, damage, count version capture, reason/reference, pending retry, and movement IDs for reversal references. Unit, lint, production build, and five anonymous/mobile browser checks pass locally. | 32ea4ec; live WorkOS check pending |

Do not mark complete based on a UI screenshot, a build alone, or mocked provider success alone. Update this record with the commit and CI run after PostgreSQL acceptance, and keep authenticated UI acceptance open until a real WorkOS journey is available.
