# Tasks

Use this file for cross-session task tracking only.

## Active

### Frontend Platform

- PO payment window parity with `ProcessOrderModal`:
  - Reuse the current payment block as the source of truth for layout and behavior.
  - Mirror the stacked payment control, quick-entry amount field, remaining-balance hint, and label + calendar trigger for payment date.
  - Keep the payment amount cursor-safe while typing and format on blur.

### Lint Remediation

- Run a full source lint sweep and preserve the report for review.
- Resolve the biggest rule categories first:
  - `react-hooks/set-state-in-effect`
  - `react-hooks/exhaustive-deps`
  - `react-hooks/refs`
  - `react-hooks/purity`
  - `no-unused-vars`, `no-dupe-keys`, `no-useless-escape`, `no-empty`
- Break the cleanup into feature-area passes:
  1. Admin area: `src/features/admin/*` and shared admin hooks.
  2. Catalog & products: `src/features/catalog/*` and mobile product views.
  3. Commerce purchase flows: `src/features/commerce/purchase/*`.
  4. Checkout/cart/auth surfaces: `src/features/checkout/*`, `src/features/cart/*`, `src/features/auth/*`.
  5. Shared utilities and framework code: `src/shared/components/*`, `src/shared/hooks/*`, `src/shared/utils/*`, `src/RootShell.jsx`.
- For each pass:
  - fix invalid effect state updates and hook dependency issues,
  - remove dead imports/unused variables,
  - refactor impure render-time expressions,
  - keep lint fixes local and regress feature behavior with quick smoke checks.
- Validation criteria:
  - `npm run lint -- --max-warnings=0` passes for the whole `src` tree,
  - no new global disable-comments are introduced except clearly justified cases,
  - the developer can rerun targeted checks such as `npx eslint --ext .js,.jsx src/features/admin --max-warnings=0`.
- Current status: Admin area pass complete; proceeding to Catalog & products.

### Ops & Scripts

- None.

### Backend & Security

- None.

## Next

- Catalog & products lint pass: `src/features/catalog/*` and mobile product views.

## Backlog

### Performance Optimization Checklist (Conditional)

- Only optimize if profiler data or real UX shows a problem.
- Reduce render-time computations.
  - Trigger: typing or interactions feel laggy.
- Virtualize large lists.
  - Trigger: list has more than 100 rows or profiler shows list re-render cost is high.
- Optimize API calls and caching.
  - Trigger: repeated or slow network requests are observed.
- Lazy-load heavy client libraries such as `jspdf` and `xlsx`.
  - Trigger: initial load feels slow or bundle size is noticeably large.
- Audit reducers for unnecessary churn.
  - Trigger: profiler shows avoidable re-renders from state updates.
- Audit `useEffect` dependencies.
  - Trigger: unexpected repeated updates or CPU spikes appear.
- Simplify DOM-heavy views, modal trees, and animation work.
  - Trigger: UI feels heavy or layout and paint time is high.
- Clean up dev-environment slowness.
  - Trigger: HMR is slow or local dev feels laggy.
- Do not spend time on areas already addressed: file size, hook count, dead code, and basic React patterns.

### Cashbook Ledger Integrity Overhaul

- Design spike: range-lock query/load test, opening-entry race handling, hash canonicalization, and migration rollback drill.
- Operational safeguards: backups/recovery, audit fields, recalculation guard, and observability.
- Ledger core: schema and constraints, single-write rule, date-wise balance recalc, opening-entry rule, idempotency, backdated-entry limits, negative-balance policy, soft-delete protection, integrity checks, performance indexes, and feature-flag rollout.
- Trust layer: adjustments, safe undo, daily locks, reconciliation, and atomic error recovery.
- UI reflection: running balance timeline, visual anchors, color logic, today focus mode, last-entry highlight, grouping/sorting/empty state, quick entry, manual vs auto toggle, and task integration.
- Future: UI-only smart alerts and timeline virtualization.
- Validation: test real-shop scenarios for wrong entries, missing cash, busy hours, and multi-user contention.
- Sequence: schema and indexes -> `ledgerService.insertEntry()` -> `recalculateFrom(sequence_no)` -> reversal/idempotency -> basic timeline UI -> enhancements.

## Done

- Performance posture hardening:
  - Added a hard `LIMIT` cap to the legacy product array API path so product fetches stay bounded.
  - Added row-window virtualization for the stock ledger and desktop product grid to keep DOM size predictable.
  - Split product search into local draft state plus a debounced applied query so typing stays responsive.
  - Verified the current codebase does not show additional systemic performance killers beyond the known data-fetch and list-render bottlenecks.
- Product bulk job system:
  - Added persisted admin bulk jobs for catalog updates with idempotency, lease-based runner claims, retry-failed, and cancel support.
  - The products screen now submits bulk updates as jobs and shows a compact job status strip while the runner processes them in the background.
  - Updated the catalog route inventory, API contract, and database notes for the new bulk-job flow.
- Product import/export refinement:
  - Product import confirm now enqueues `import_products` bulk jobs instead of applying rows in a single transaction.
  - Import preview keeps the row-level validation and conflict view, while export now follows the current filtered catalog view by default.
- Enforce `planned_order_date` on purchase-order create:
  - Removed create-time fallback from the purchase order handoff so new drafts always send an explicit planned date.
  - The create validator now rejects missing or invalid `planned_order_date` values instead of inferring them from `expected_delivery`.
  - Updated the purchase-order create docs and validation notes to match the stricter contract.
- Visual hierarchy cleanup:
  - Reduced border density across the admin chrome and product toolbar surfaces.
  - Strengthened active, selected, and primary states in `src/features/admin/components/AdminUi.css` and `src/features/admin/pages/AdminPage.css`.
- Keyboard shortcuts and command palette:
  - Added Enter/Tab row navigation, Shift-select support, and a `Cmd+K` command palette for common product actions.
  - Files: `src/features/admin/sections/ProductsSection.jsx`, `src/features/admin/sections/products/ProductsTablePanel.jsx`, `src/features/admin/sections/products/ProductsGridPanel.jsx`, `src/features/admin/components/CommandPalette.jsx`, `src/features/admin/hooks/useAdminProductTable.js`, `src/features/admin/pages/AdminPage.css`.
- Product undo:
  - Added a local last-action undo strip in the product table for edits, deactivate, and permanent-delete flows.
  - Undo restores the prior product state from the table snapshot without requiring a page reload.
- Bulk edit and multi-select actions:
  - Added a sticky products selection bar that stays visible across table and grid views.
  - Multi-select now toggles from the row picker and grid cards, and bulk edits can update category, price, stock, and status in one pass.
  - Selected products can be cleared or expanded to the visible rows without leaving the listing.
- Product table toolbar cleanup:
  - Collapsed the product workspace into one compact search, filters, and add-product toolbar.
  - Persisted the product table search and filter state in localStorage.
  - Moved the category/status/stock/column controls into a single filters drawer and removed the extra add entry from the header.
- See `CHANGELOG.md` for the full completed-change history.
- Recent completed work:
  - Supplier-first purchase-order flow and supplier visit handoff.
  - Daily cash tally plus current-day dashboard cash summary.
  - WhatsApp delivery-scope alignment and manual prepare flow.
  - Credit-history and payment-intelligence parity work.
  - Shell/runtime and modal contract hardening.
  - Billing render isolation pass:
    - Split `BillingTab.jsx` into a thin wrapper and `BillingTabController.jsx`.
    - Moved billing draft state into `useBillingState` and pricing/derived totals into `useBillingPricing`.
    - Added memoized billing sections for customer, item, and payment areas plus memoized bill rows.
    - Extracted the item-edit, search, and keyboard callbacks into `useBillingItemHandlers` so the controller keeps less render-coupled logic.
    - Extracted customer, payment, share, and clear checkout callbacks into `useBillingCheckoutHandlers` to finish thinning the controller boundary.

## Notes

- Before any backend change, re-read `ARCHITECTURE.md`, `ROUTES.md`, and `AGENTS.md`.
- Preserve compatibility endpoints, aliases, and dual `GET`/`POST` internal routes unless a task explicitly includes a migration plan.
