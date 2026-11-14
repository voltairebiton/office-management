# C09 — Room targets and shortage visibility

Status: Open. Dependencies: C04, C07, C08.

## User outcome

Managers define what a room should contain and can see exactly what needs replenishment.

## Deliverables

- Per-room/item quantity target, edit/remove target, and scoped requirements list.
- Join targets to actual room stock; compute shortage and surplus.
- Link a shortage to a prefilled deployment form that still validates current stock at submit.

## Acceptance criteria

Label tests `C09-AC1`, `C09-AC2`, etc., matching the numbered criteria below. Shared authorization, audit, validation, and idempotency requirements in the [MVP plan](../README.md) also apply.

1. An authorized manager sets one nonnegative whole-unit target per active room/item. Repeated updates do not create duplicate requirements; foreign tenant/office inputs are rejected.
2. Deployed quantity is the current room balance, never a manually editable requirement field. Shortage = max(target - deployed, 0); surplus = max(deployed - target, 0).
3. Missing stock balance counts as zero. A zero target is allowed. Removing a target does not delete stock or movement history. Existing stock remains visible even without a target.
4. Receipts in storage do not change deployed quantity. Deployment, return, consumption, and corrections update the correct room shortage after commit.
5. Shortage lists support office/room/item/status filtering with stable pagination. Aggregates count distinct rooms needing supplies. Quantity totals are grouped by item/base unit; never add chairs and tissue boxes into a misleading inventory total.
6. Assigned headcounts are shown as context only; no automatic per-person target calculation or attendance inference.
7. Prefilled deployment is a convenience only: server authorization, source availability, active status, and idempotency rules are reapplied. Validation failure leaves the target and stock unchanged.

## TDD sequence and evidence

- Red unit tests for zero, exact target, shortage, and surplus calculations using boundary quantities.
- Real database tests connect receipts → deployments → consumption → shortages, including no-balance and no-target cases.
- Cross-tenant/office filter and aggregate tests.
- Browser journey sets a target, sees shortage, deploys available stock, and sees the new status after reload.

## Boundaries and dependencies

No automatic replenishment, attendance-based targets, subscriptions, or cross-item unit aggregation.

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
