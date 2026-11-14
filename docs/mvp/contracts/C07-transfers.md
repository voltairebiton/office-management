# C07 — Room deployments, returns, and office-local transfers

Status: Open. Dependencies: C06.

## User outcome

Stock moves between locations within one office without duplication or negative balances.

## Deliverables

- Transfer storage → room, room → storage, and between permitted locations in the same office.
- Atomic debit/credit entries with one shared movement and request identity.
- Deployment/return forms and clear available-stock display.

## Acceptance criteria

Label tests `C07-AC1`, `C07-AC2`, etc., matching the numbered criteria below. Shared authorization, audit, validation, and idempotency requirements in the [MVP plan](../README.md) also apply.

1. Transfer quantity is positive and bounded; source and destination are distinct active locations in the same authorized office and tenant. Item/unit identity is shared on both sides.
2. A successful transfer decreases the source and increases the destination by exactly the same amount. The tenant/office total is conserved and the movement links both entries.
3. Insufficient stock rejects the entire transfer; exact depletion succeeds. No balance becomes negative. A client-supplied availability value is never authoritative.
4. Concurrent competing transfers serialize or return a recoverable conflict; aggregate withdrawals never exceed source stock. Lock ordering prevents opposite-direction transfers from deadlocking indefinitely; bounded retry preserves idempotency.
5. Identical retry requests create one movement. Payload mismatch conflicts. Failure between debit and credit rolls back everything, including the request-success record.
6. Returning reusable furniture removes it from room deployment and restores storeroom quantity. Consumables may also be returned if physically unused; consumption uses C08.
7. Archival and permissions are rechecked by the service. Movement history remains readable after resources are archived.

## TDD sequence and evidence

- Red two-connection tests: two withdrawals competing for the last units and opposite-direction transfers.
- Inject a failure between debit/credit and assert full rollback and retryability.
- Verify ledger conservation and idempotency for deploy and return.
- Browser journey deploys chairs, sees room/storage values change, then returns some chairs.

## Boundaries and dependencies

No inter-office transfer, shipping, reservations, or automatic restocking.

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
