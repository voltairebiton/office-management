# C08 — Consumption, damage, and stock-count corrections

Status: Open. Dependencies: C06.

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
| Pending | — | — | — | — |

Do not mark complete based on a UI screenshot, a build alone, or mocked provider success alone.
