# C05 — Item catalog and stock locations

Status: Open. Dependencies: C02, C03.

## User outcome

Teams maintain a consistent catalog of supplies/furniture and know where quantities are stored.

## Deliverables

- Tenant item catalog: SKU/code, name, category (consumable or reusable), base unit, active flag.
- Office storeroom/pantry locations and a stock location for each tracked room.
- Catalog/location UI with scoped search, pagination, validation, and archival.

## Acceptance criteria

Label tests `C05-AC1`, `C05-AC2`, etc., matching the numbered criteria below. Shared authorization, audit, validation, and idempotency requirements in the [MVP plan](../README.md) also apply.

1. Only authorized catalog managers create/edit items; organization admin has this capability initially. Office managers can select shared catalog items for their permitted offices without automatically changing the tenant-wide catalog.
2. SKU is normalized and unique within the tenant. Unit/name are required; the base unit is a single whole-unit label. No fractional quantities or conversions are accepted.
3. A room location belongs to exactly that room/office/tenant and is unique. Other storage locations have unique normalized codes within an office.
4. Creating a room location is idempotent. Foreign room/item/location IDs cannot be attached. Room archival cannot orphan active stock.
5. Catalog services expose the archival and identity-lock policy needed by inventory. C06 must activate and test the movement-dependent restrictions when its ledger is introduced: SKU identity/category/unit cannot reinterpret history; descriptive name edits retain historical movement snapshots.
6. Unused items/locations may be archived and excluded from active selectors. C06 must add the nonzero-balance archive blocker before stock writes are exposed. Restoration is excluded initially; unused setup mistakes can be edited.
7. Initial balances can only be introduced through C06 receipts, never by editing a catalog quantity field.

## TDD sequence and evidence

- Red validation tests for unit/quantity boundaries and SKU collisions.
- Integration tests for tenant/office composite keys and one location per room.
- Test unused catalog/location archival now. Movement-dependent locks and stock-aware archival are C06 acceptance responsibilities, avoiding a dependency cycle.
- Browser journey creates catalog items and storage locations, then selects them in inventory forms.

## Boundaries and dependencies

No pricing, vendors, procurement, purchase orders, barcode hardware, serial-number assets, or unit conversions.

## Completion record

- [ ] Acceptance tests written first; meaningful red failures recorded.
- [ ] Implementation and relevant UI complete.
- [ ] Acceptance and regression checks pass; required migrations reviewed/applied to test environment.
- [ ] Authorization and failure behavior verified; documentation updated.
- [ ] Evidence added below; all dependencies complete.

| Criterion | Test/check path | Red failure or live-check prerequisite | Green result | Commit/evidence |
| --- | --- | --- | --- | --- |
| C05-AC1 | `tests/unit/authorization.test.js`, `tests/catalog-database.test.js`, catalog forms | Red: the authorization test showed the admin lacked the new catalog capability; after the policy change, it verifies managers do not get it by default. | Admin-only catalog writes, manager catalog reads, unit suite, and UI/build checks pass. | `catalog:manage` is granted only to organization admins by the default role policy; [CI run 43616928534](https://github.com/voltairebiton/office-management/actions/runs/43616928534). |
| C05-AC2 | `tests/unit/catalog-validation.test.js`, `tests/catalog-database.test.js` | The first validation test run could not load the not-yet-created module; this setup failure is not counted as a behavioral red. SKU and unit rules are covered by the written contract tests. | 7 normalization assertions and tenant SKU uniqueness checks pass. | Items store normalized tenant-unique SKUs and one lower-case whole-unit label; [CI run 43616928534](https://github.com/voltairebiton/office-management/actions/runs/43616928534). |
| C05-AC3–AC7 | `tests/catalog-database.test.js`, `drizzle/0005_uneven_princess_powerful.sql`, catalog workspace | Local PostgreSQL is unavailable because `TEST_DATABASE_URL` is unset; no application database was used. | Fresh migration, composite location scope, idempotent room-location creation, audit, and archival acceptance pass in CI. | Commit `2757191`; [CI run 43616928534](https://github.com/voltairebiton/office-management/actions/runs/43616928534). Authenticated browser acceptance remains pending WorkOS setup. C06 will add movement-dependent identity and nonzero-stock guards before receipts are exposed. |

Do not mark complete based on a UI screenshot, a build alone, or mocked provider success alone.
