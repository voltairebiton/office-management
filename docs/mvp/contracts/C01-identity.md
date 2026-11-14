# C01 — WorkOS identity and tenant onboarding

Status: Open. Dependencies: C00.

## User outcome

A real staff member signs in to the right organization, and local identity records follow authoritative WorkOS membership.

## Deliverables

- Complete real sign-in, callback, sign-out, missing-organization handling, and explicit organization selection for users with multiple memberships.
- Provide an operator bootstrap command/runbook for the first tenant and admin from verified WorkOS records; self-service tenant signup is excluded.
- Add a server provider adapter, idempotent local projections, and signed webhook processing with safe retries.
- Set up local/staging credentials and callback/webhook delivery once the handlers exist.

## Acceptance criteria

Label tests `C01-AC1`, `C01-AC2`, etc., matching the numbered criteria below. Shared authorization, audit, validation, and idempotency requirements in the [MVP plan](../README.md) also apply.

1. Anonymous users cannot access staff data. Invalid callbacks produce a recoverable error. Sign-out invalidates the application session; protected navigation cannot reveal previous account data.
2. First tenant bootstrap requires authoritative organization membership and administrative permission. A pending member, arbitrary first login, or browser-supplied organization ID never gains admin rights.
3. Switching organization succeeds only for an active membership and resolves to the correct local UUID. Failed switching leaves no mixed tenant state.
4. Repeated logins and provider deliveries create one user, organization, and membership projection. Local membership defaults remain non-privileged.
5. Webhooks validate signature and timestamp before processing; invalid/replayed deliveries cannot mutate state. Duplicate valid deliveries are idempotent. Processed-event state and projection updates commit atomically.
6. Out-of-order events cannot restore a removed membership. Reconcile against current provider state instead of trusting stale payload ordering. Provider errors produce retryable failures and do not mark events successfully processed.
7. A removed/deactivated member loses business access on its next business request. Fresh provider checks are the initial policy; any later cache requires a separately approved and tested revocation bound. Provider unavailability fails closed for business access.
8. Automated adapter tests pass and an actual staging user completes organization sign-in/out. Real provider delivery is recorded separately from simulated tests.

## TDD sequence and evidence

- Red tests for unknown membership, missing org, revoked member, failed provider lookup, and malicious organization selection before implementing projection/access behavior.
- Real database tests for duplicate deliveries, rollback on projection failure, and older events following removal.
- Handler tests for signatures and replay checks; browser tests for redirects and organization switching.
- Live acceptance: actual WorkOS login, organization context, logout, and signed event delivery with no secrets in evidence.

## Boundaries and dependencies

Requires Office Management server API credentials and a webhook signing secret/endpoint. No billing, SSO configuration UI, or automatic admin promotion.

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
