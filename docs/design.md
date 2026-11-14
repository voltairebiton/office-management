# Workspace interface

## Direction

A calm, practical workspace for the people keeping an office running. A fixed deep-teal sidebar provides orientation; warm-white surfaces keep tables and quantities easy to scan. Sage is a supporting accent. Amber identifies shortages, alongside explicit text such as “Needs 4”; color is never the only status cue.

The palette is our own design choice. The approach follows [Atlassian's color guidance](https://atlassian.design/foundations/color/): use neutrals for most surfaces and text, and give colors consistent semantic roles. [IBM Carbon's color guidance](https://www.carbondesignsystem.com/building-blocks/foundations/color/guidelines) also informed the use of neutral layers to separate work areas.

| Role | Color |
| --- | --- |
| Sidebar / primary anchor | `#173f3a` |
| Action accent | `#23685b` |
| Workspace background | `#f6f7f4` |
| Panel surface | `#ffffff` |
| Primary text | `#243b37` |
| Secondary text | `#687873` |
| Shortage text / background | `#865b19` / `#fcf1dd` |
| Positive status text / background | `#426333` / `#ecf3e8` |

## Navigation

- **Workspace:** Overview, Offices & rooms, People.
- **Inventory:** Catalog & stock, Room requirements, Stock movements.
- **Services:** Refreshments and Visitors, explicitly marked as future workflows.
- **Administration:** Workspace settings, currently read-only account details.

Inventory belongs in its own group because receipts, deployments, and room shortages form a recurring workflow. Refreshment orders are separate from inventory purchasing. Assigned headcounts must never be described as attendance.

The header office filter scopes the preview's data, totals, and lists together. Search filters the current inventory/people list. The mobile sidebar uses a native modal dialog with a close button, Escape dismissal, and focus restoration. Tables scroll within their panels on narrow screens.

## Implementation boundary

`/dashboard` requires the verified WorkOS organization session. It shows an honest foundation state without fabricated counts or operational records. It does not yet query tenant data or provide business mutations. Office provisioning, permissions, and inventory services are still part of the next milestone.

`/preview` is a public, read-only design preview, using static fictional fixtures from `src/lib/preview-workspace.js`. It uses the same dashboard component, is labelled throughout, and has no Neon queries, authentication bypass, or write operations. Preview people are fictional. Service pages explain their planned workflows rather than offering inactive submission controls.

Do not add real tenant records to the public preview. Future dashboard queries must use server-side tenant and office authorization; hiding sidebar links is not authorization.
