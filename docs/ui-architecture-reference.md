# UI Architecture Reference

See also: [frontend.md](frontend.md), [ui-ux.md](ui-ux.md), [patterns.md](patterns.md), [anti-patterns.md](anti-patterns.md)

This document is the reference for future page and modal modifications. Use it to decide the correct surface, interaction pattern, and escalation path before changing UI structure.

## System Identity

Rows for viewing · Modals for acting · Context on demand

## Core Rules

- View operational work through row-based surfaces by default.
- Use modals or sheets for focused actions.
- Use navigation only for deep review, audit, reporting, or analysis.
- Keep layouts compact: prefer 2 to 3 visual levels, not stacked card towers.
- Make state visible and scannable without opening secondary panels.
- Keep routine actions inside the current surface. Do not force navigation for common work.
- Shared filter primitives must look identical wherever they appear. Pages may adjust width, tone, labels, or placeholder copy, but the structure, spacing, icon placement, and interaction grammar for `SearchFilter`, `DropdownFilter`, and `DateRangeFilter` must remain the shared canonical pattern. Do not wrap a shared filter in an extra bordered shell or nested card; keep one outer surface and let the shared control own the inner chrome. For `DateRangeFilter`, the preset strip stays on one horizontal row and scrolls instead of wrapping when space is tight.
- Scoped search is part of that canonical pattern. When a page lets the user choose a field before searching, keep the same orders-page bar layout and rhythm: scope select, text entry, submit action, and the same compact pill-like surface. The search control should stretch across the row rather than sit inside a separate box.
- Grouped and advanced filters follow the same rule. Keep the orders-page filter bar rhythm, the toggle/clear actions, and the stacked advanced rows visually consistent across pages; only the filter contents should vary. Use one outer tray with flat label/control rows, and keep summary pills above the tray instead of duplicating them inside row labels.
- Date range controls may use an icon-only trigger when density matters, but the popover grammar stays shared: calendar icon, preset pills first, then subordinate custom dates inside the same canonical surface. Keep `Custom` as an explicit toggle, and make the picker dismissible by the toggle itself, by completing a full range, by Clear, outside click, or Escape.
- The shared date-range popover now uses a compact preset row first, a hidden-by-default custom section, and an optional expandable calendar. Pages may only change density or outer fit, not the picker structure.
- Stock-ledger history should now read as the same visual family as orders. If it needs scoped search or advanced filters, reuse the same bar geometry, row rhythm, and control density instead of introducing a page-specific filter shell. Keep the outer card singular and let the filter pills summarize state above it.
- `StockLedgerHistory` is a useful assembly example for this family, but the canonical design contract should live in the individual shared components. Pages should be composed from shared search, filter, date-range, stat-card, table-shell, header, and empty-state primitives instead of freezing one page as the source of truth.
- Credit Khata should reuse the same compact ledger family as stock-ledger history: shared search bar, grouped day sections, summary stats, sticky table shell, and compact row actions. Keep the modal lightweight and keep reference/detail text inside the row instead of adding a wider chrome stack.
- The restock dashboard should follow the stock-ledger family too: compact search and filter bar, summary stat cards, one sticky table container, and short row chrome. Keep selection and sync controls in a slim toolbar, not in a second card tower.
- Product Insights should follow the same family as orders and stock-ledger when it uses scoped search, grouped filters, summary stats, and dense sortable tables. Reuse the same control grammar, inline date-range treatment, and table compactness instead of introducing a separate page-only chrome system.
- Product Insights is the canonical compact analytics table for this app. Reuse its six-column structure, keep `Cost / Margin` as the single stacked summary cell for latest cost, margin, change, and range, and do not split those metrics back into separate columns when extending similar pages.
- Distributor Insights should reuse the same compact control shell and scan-first table language as Product Insights. Keep the shared search/date bar, summary-stat strip, and dense sticky table surface, and keep long explanations inside the detail panel instead of adding page-specific chrome.
- The admin sidebar should read as a light premium shell, not a dark console. Reuse the same rail + panel architecture on desktop and mobile, keep the palette white and soft indigo, use sans-serif navigation text, keep the mobile drawer visually aligned with the desktop panel rather than introducing a separate visual language, and let the expanded desktop panel collapse again when the user clicks outside it.
- In dense insight tables, prefer short text column headers and abbreviated metric cells. Related metrics may be stacked into one cell with the primary value on top and the rest in secondary text. Keep the visible row chrome short and scan-first, and move full descriptions into titles, hover affordances, or the inline detail panel instead of repeating them in every row.
- Shared tables, row boards, compact control bars, and other repeated data surfaces should follow the same rule. If the app uses the same component family on multiple pages, keep its frame, column rhythm, action placement, density, and sticky-header behavior consistent so the surface reads as one product-wide pattern. Keep one outer border and one scroll container; do not stack nested table shells.
- Sortable table headers should stay compact and modern: use a full-width button inside `th`, expose `aria-sort`, and pair the label with a small state icon instead of adding extra header chrome.
- Dense inventory and audit tables may group by local day when the date is the primary scan axis. In that case, show a single day chip or section label, remove repeated timestamp columns, keep the day header visually lighter than the actual data rows, and keep the table header pinned inside the table's own scroll region.
- Stock quantity and balance values in ledger-style tables should render as whole numbers with no decimal precision.
- Type columns in dense ledgers should stay icon-first and minimal. If the surrounding UI already communicates the transaction kind, keep the visible cell to the glyph only. Put the full label in hover or accessibility metadata instead of row chrome, and do not add a dash badge or extra text chip.
- When a stock-ledger row needs to show a linked document number, keep `PO #...` for incoming purchase rows and `Bill #...` for outgoing stock rows as the secondary line under the product name instead of restoring separate reference, by, or notes columns.
- After one page establishes the canonical treatment for a shared surface family, later pages should reuse that same treatment instead of re-verifying or restyling it. Fit the page with outer spacing or width bounds only; do not create a new visual identity for the same search, filter, table, or row-board family.

## Loading System

Loading states should be compact, structural, and component-driven rather than text-driven.

Rules:

- Tables and list surfaces should use `SkeletonRow` placeholders that match the real row height and column rhythm.
- Keep table skeletons short and bounded: 3 to 6 rows max, no infinite skeleton stacks.
- Use a neutral grey skeleton palette with a 1.5s shimmer and a 6px corner radius.
- Cards and modals should use `SkeletonBlock` when the structure is not ready yet.
- Search, filter, and other inline controls should use `InlineLoader` inside the existing control chrome. Do not overlay the page or swap in a skeleton for a tiny async action.
- Buttons should use `ButtonLoader` inside the button so width stays stable and layout does not jump.
- Page-level fallback loading should be a minimal centered glyph only when no structure exists yet.
- Never mix skeletons and large spinners on the same surface.
- Avoid `Loading...` text in the UI except as a last-resort fallback during very early page boot.
- Do not flash loaders for very fast responses; if the load is short, keep the control stable and let the content appear.

Shared module:

- Keep the reusable loading primitives under `src/shared/components/loading/*`.
- Prefer four primitives only: `SkeletonRow`, `SkeletonBlock`, `InlineLoader`, and `ButtonLoader`.
- Keep loading tokens consistent across the app: skeleton color `#E5E7EB`, highlight `#F3F4F6`, animation duration `1.5s`, and border radius `6px`.

## Surface Selection

### Operational Surface

Use row-based layouts for workflows such as purchase routine, payments, sales operations, stock actions, and other act-in-place tasks.

Rules:

- Entity, state, and action must be visible in the row.
- One primary action should stay visible.
- Secondary actions may live in an overflow menu.
- Avoid action-heavy tables and long inline button bars.

### Audit And Review Surface

Tables are allowed only for read-heavy audit, reconciliation, history, or dense comparison views.

Rules:

- Treat tables as analysis surfaces, not workflow engines.
- Avoid inline editing in dense audit tables.
- Avoid putting routine workflow actions inside table rows.
- Use sorting and filtering to support inspection, not to replace operational rows.

### Action Surface

Use a modal or bottom sheet for standard actions.

Rules:

- One modal equals one job.
- Keep the surface single-purpose.
- Prefer 2 to 4 core inputs when possible.
- Show impact preview only when the action changes numeric or state values.
- Use conditional fields to remove irrelevant inputs.
- Keep the primary CTA explicit about the outcome.

### Workspace Escalation

If the interaction is too complex for a clear modal, escalate to a dedicated workspace instead of enlarging the modal.

Use a workspace for:

- full order editing
- bulk operations with review
- complex entity management
- workflows that need persistent row review before submit

Workspace rules:

- Preserve the same scan -> act pattern.
- Do not turn the workspace into a form-dump page.
- Keep the main header and footer anchored where possible.
- Prefer one primary scroll area over nested scroll stacks.

### Context Panel

Desktop may add a side context panel, but it is read-only.

Rules:

- zero inputs
- zero write actions
- zero inline editing

Allowed uses:

- history
- related records
- insights
- read-only summaries

Mobile fallback must be explicit: inline expand, secondary sheet, or omission by priority.

## Row System

Each row should carry:

- Primary: entity identity
- Secondary: key supporting details
- State: status, count, amount, or risk
- Actions: one visible primary action plus optional overflow

Rules:

- Keep rows compact and scan-first.
- Avoid more than 2 to 3 visible levels in a row.
- Keep state visible without forcing hover or expansion.
- Avoid 5 to 6 inline actions.
- Avoid helper text that changes row height while the user is editing.
- Keep feedback color-led first, detail-led second.

## Modal And Sheet System

Base structure:

- Header
- Inputs
- Impact preview when needed
- Primary action

Rules:

- Keep modal titles literal and action-specific.
- Use intent switches only when they clarify financial or state impact.
- Hide irrelevant fields instead of disabling everything.
- Restore focus safely after close.
- Provide a clean keyboard path for open, submit, and dismiss.
- On mobile, use a sheet when that is the natural small-screen surface.

## Post-Action Update Rule

After a successful modal or sheet action:

- update the current surface in place
- preserve filter, sort, group, and selection when possible
- preserve scroll position where possible
- reconcile with the source of truth after local update

Do not require a full page refresh to see a completed action.

## Scale Model

Scale should be solved through visibility and performance, not by defaulting to bigger tables.

Use:

- Filter
- Sort
- Group
- Progressive load
- Virtualization for long lists

Rules:

- Filters should be visible and reduce the dataset early.
- Sorting should support scan order without breaking the surface pattern.
- Grouping should reuse the same row structure inside each group.
- Progressive load should keep first paint small.
- Virtualize long lists to protect scroll performance.

## Empty State System

Empty states must guide the next action.

Types:

- No data
- Filter empty
- Context empty

Rules:

- Explain why the state is empty.
- Offer the next relevant action when applicable.
- Use modal or sheet creation paths instead of dead-end instructions.

## Bulk Action Rule

Bulk actions require an explicit selection model.

Rules:

- Keep selection visible and reversible.
- Show the impact of the bulk action before submit.
- Escalate to a dedicated workspace when the review burden becomes high.

## Navigation Rule

Navigation is allowed for:

- deep history
- reports
- analysis
- audit views

Navigation should not be used for:

- routine operational actions
- simple edits that fit a modal
- multi-step action flows that can be completed in place

## PR Review Checklist

- Correct surface chosen: row vs table vs modal vs workspace
- Control bar supports the surface instead of duplicating actions elsewhere
- Entity, state, and primary action are visible
- Secondary actions are handled through overflow when needed
- Modal or sheet stays single-purpose
- Complex flows are escalated to a workspace instead of an oversized modal
- Impact preview is present only when it adds decision value
- Filter, sort, group, and load strategy are appropriate for scale
- Empty states explain the situation and offer a next step
- Desktop context is read-only
- Mobile fallback is explicit
- Post-action update keeps the current surface stable

## Shared Surface Verification

Use this quick check before approving a page that relies on the shared search/filter/table system:

- Search uses the shared `SearchFilter` shell and keeps the same control order.
- Filters use one `FilterBar`, one `FilterTray`, one `FilterRow` per row, and `FilterPills` for active chips.
- Active chips match the shared pill size, spacing, and icon placement.
- Date chips follow the shared preset-label behavior when a range matches a preset.
- Summary counts use `StatCard`, not page-local stat blocks.
- The outer table frame uses `TableShell`; page-specific logic stays inside the body.
- Page CSS only owns layout bounds, width, or table mechanics that the shared components do not own.

## Current Reference Implementations

Use these files as working examples of the intended direction:

- Compact operational row board: [src/features/commerce/purchase/components/sections/dashboard/PurchasePlanningPanel.jsx](../src/features/commerce/purchase/components/sections/dashboard/PurchasePlanningPanel.jsx)
- Compact operational control/data surface: [src/features/commerce/purchase/components/sections/PurchasePaymentsSection.jsx](../src/features/commerce/purchase/components/sections/PurchasePaymentsSection.jsx)
- Single-job transaction modal: [src/features/commerce/purchase/components/modals/ProcessOrderModal.jsx](../src/features/commerce/purchase/components/modals/ProcessOrderModal.jsx)
- Single-job intent-led modal: [src/features/commerce/purchase/components/modals/LedgerEntryModal.jsx](../src/features/commerce/purchase/components/modals/LedgerEntryModal.jsx)
- Escalated task workspace: [src/features/commerce/purchase/components/PurchaseEntryModals.jsx](../src/features/commerce/purchase/components/PurchaseEntryModals.jsx)

## Summary Memory Block

View:

- Rows for operational workflows
- Tables only for audit or deep review

Act:

- Modal or sheet for standard focused actions
- Workspace for complex flows

Scale:

- Filter + Sort + Group + Load + Virtualize

Desktop:

- Read-only context panel only

Empty:

- Always explain and guide the next action
