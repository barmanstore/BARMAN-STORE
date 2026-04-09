# Patterns

See also: [controllers.md](controllers.md), [services.md](services.md), [naming-conventions.md](naming-conventions.md)

## Current Good Patterns

- Feature-first organization on both frontend and backend.
- Page orchestration through controller hooks plus smaller helper hooks:
  - [src/features/admin/hooks/useAdminPageController.js](../src/features/admin/hooks/useAdminPageController.js)
  - [src/features/catalog/products/hooks/useProductsController.js](../src/features/catalog/products/hooks/useProductsController.js)
  - [src/features/commerce/purchase/hooks/usePurchaseManagementController.js](../src/features/commerce/purchase/hooks/usePurchaseManagementController.js)
- Backend route composition through feature-local helper trees instead of giant single files:
  - `server/features/commerce/routes/purchaseOrders/listCreate/*`
  - `server/features/communication/routes/messageToCustomer/*`
- Normalization helpers for shared domain state, such as purchase-order status mapping in [src/features/commerce/purchase/utils/orders.js](../src/features/commerce/purchase/utils/orders.js).
- Request idempotency support through client request IDs.

## What To Repeat

- Add behavior inside an existing feature before creating a new top-level module.
- Keep data normalization near the domain that needs it.
- Prefer small helper extraction over broad architectural rewrites.
- Shared controlled UI primitives that can travel across features should live under `src/shared/components/*`, such as the filter inputs in [src/shared/components/filters/SearchFilter.jsx](../src/shared/components/filters/SearchFilter.jsx), [src/shared/components/filters/DropdownFilter.jsx](../src/shared/components/filters/DropdownFilter.jsx), and [src/shared/components/filters/DateRangeFilter.jsx](../src/shared/components/filters/DateRangeFilter.jsx). When a shared filter needs to support both quick chip rows and longer Amazon-style checklist panels, extend the shared primitive with a bounded variant prop instead of forking a purchase-only filter component.
- Date range controls should keep one shared picker shell across features. Dense pages may use an icon-only trigger, but the open picker must stay preset-first with a compact chip row in one horizontal row, a hidden-by-default custom section, and an optional expandable calendar everywhere. When the row cannot fit, it may scroll horizontally, but it should not stack vertically. The `Custom` entry must stay visible as a toggle, and the picker should close cleanly when the range is completed or dismissed.
- For scoped search, reuse the same orders-page surface grammar across features: scope select, text entry, and submit action in one compact bar. Page-specific code may change which fields are searched, but it should not invent a different bar shape or visual hierarchy for the same job.
- For grouped and advanced filters, reuse the same orders-page filter grammar across features: compact trigger bar, consistent toggle/clear actions, and stacked advanced rows with the same label/control rhythm. Page-specific code may change the filter set, but it should not invent a new filter-section silhouette.
- Use stock-ledger history as the follow-up example for this pattern: its search and filter area should stay visually interchangeable with the orders-page surface, so new pages can adopt the same shell without re-deriving spacing or control placement. Keep that surface to one outer card, with summary chips above the tray and no nested card borders inside the rows.
- Credit Khata should reuse the same compact ledger family as stock-ledger history. Keep the search/filter bar, summary strip, grouped day rows, sticky table shell, and modal actions visually interchangeable with the rest of the admin system.
- Keep the restock dashboard visually interchangeable with stock-ledger history. Use the same compact filter shell, summary stat cards, sticky table container, and short action toolbar, and avoid adding a second card stack around the main review surface.
- Product Insights should reuse the same scoped search, grouped filters, summary stats, and compact sortable table grammar as orders and stock-ledger. Keep the page focused on data and filter state, not on page-specific chrome.
- Product Insights is the canonical compact analytics table pattern in this repo. Keep its six-column layout intact, and keep all cost-related detail inside the stacked `Cost / Margin` summary cell instead of reintroducing separate change or range columns.
- Distributor Insights should use the same shared search/date bar and summary-stat strip as Product Insights. Keep the row chrome compact, keep the table sticky and scan-first, and prefer the detail panel for long supplier narratives instead of adding new page-specific wrappers.
- The admin sidebar should use a light premium palette across desktop and mobile. Keep the rail/panel split, but use white surfaces, soft indigo active states, sans-serif labels, the same visual language in the mobile drawer and desktop shell, and collapse the expanded desktop panel when the user clicks outside it.
- For Product Insights and similar analytics tables, prefer short text headers and compact metric stacks in the visible table body. Keep the surface compact and scan-first, and let titles, hover affordances, or the detail panel carry the full labels and longer explanations.
- Loading states should follow one compact contract across the repo: tables and lists use `SkeletonRow`, cards and modals use `SkeletonBlock`, inline async controls use `InlineLoader`, and action buttons use `ButtonLoader`.
- Use the same loading tokens everywhere: neutral grey placeholders, 1.5s shimmer, and a 6px corner radius. Do not mix skeletons and large spinners on the same surface.
- Keep table skeletons bounded to 3 to 6 rows and match the final row height so layout does not jump.
- Keep loader text out of the UI chrome. If a page must show a fallback, use the smallest possible centered glyph and only when no structure exists yet.
- When a shared component family owns its shell and tone system, keep that styling in the shared folder instead of leaving duplicate feature-specific CSS behind.
- The same rule applies to shared tables, list shells, and row-board families. If multiple pages reuse the same component family, keep the same structural wrapper, density contract, and sticky-header behavior across those pages and move page-specific differences into data, labels, or bounded variants rather than new page-only chrome. Keep one outer border and one scroll container; do not stack nested table shells.
- For sortable tables, keep header cells interactive but visually restrained: use a button-based header label, a compact sort indicator, and a stable active-state treatment instead of bulky action icons or inline menus.
- When an audit table is grouped by day, render the day once as a compact chip or section label, drop the repeated timestamp column from each row, and keep the header row pinned inside the table's own scroll area.
- Ledger quantities and balances should display as whole numbers with no visible decimal precision.
- Transaction type cells in dense ledgers should stay icon-first and minimal; use the directional glyph as the visible marker only and keep the full type name out of the row chrome.
- If a stock-ledger row has a linked document number, place `PO #...` on incoming purchase rows and `Bill #...` on outgoing stock rows as a small secondary line under the product name rather than keeping dedicated reference, by, or notes columns.
- Once a shared surface has a canonical wrapper and spacing contract, future pages should adopt it as-is. Use page-level width or margin bounds only to make the surface fit the viewport; do not rework the internal search/filter/table chrome for each page.
