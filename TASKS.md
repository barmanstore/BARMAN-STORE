# Tasks

Use this file for cross-session task tracking only.

## Active

### Ops & Scripts

None.

### Backend & Security

None.

### Frontend Platform

- Stabilize PO review modal behavior and unify PO review screens across the purchase flow:
  - Prevent the PO review workspace from dismissing on backdrop clicks.
  - Replace the legacy PO detail review surface with the shared printed-bill review sheet.
  - Keep review styling consistent across draft review and saved PO review.

## Next

### Phase 1 (Core Daily Use)

None.

### Phase 2 (Supplier Planning)

None.

### Phase 3 (Analytics Polish)

None.

## Blocked

- None currently.

## Done

- Stabilized PO review behavior and unified review layout:
  - Disabled backdrop-close on the PO create review workspace so it no longer auto-closes on stray clicks.
  - Introduced a shared `PurchaseOrderReviewSheet` and used it for both draft review and saved PO detail review.
  - Replaced the legacy order-detail preview (read-only mode) with the printed-bill review sheet so PO reviews are consistent everywhere.

- Persisted purchase-order item source and highlighted skipped supplier defaults:
  - Purchase-order save and edit flows now keep `purchase_order_items.row_source` as `supplier` or `manual` instead of dropping row origin at submit time.
  - Reopened PO edit flows preserve supplier-default locking by reading that saved row origin back into draft state.
  - The supplier-board create UI now calls out supplier-default rows that are still at qty `0` so operators can spot skipped defaults before review, while those rows remain excluded from backend submit.
- Implemented supplier-registry-driven PO board loading:
  - Added `GET /api/distributors/:id/products` so purchase create can load the selected supplier's active registered product board directly from `supplier_products`.
  - Supplier selection in PO create now seeds the board with those registered supplier products, keeps them editable but non-removable, and preserves qty `0` rows on the board while still excluding them from review and backend submit.
  - The `Add Product` picker now shows only extra catalog items that are not registered to the selected supplier and are not already on the current PO board.
  - Manual extra products are appended onto the same board as removable rows, while reopened drafts and suggested-item handoffs stay compatible with the supplier-default board merge.
- Simplified purchase-order entry into a supplier-first guided flow:
  - Replaced the heavier PO entry path with a popup-first flow: `Supplier -> Items -> Review -> Final Submit`.
  - The PO popup now opens in a compact supplier-only state first, then expands into the item screen after supplier selection.
  - The supplier-only step was tightened into one focused prompt with a flatter footer and single-column supplier card so the first action is clear and the popup no longer feels cramped.
  - The supplier step now keeps only supplier plus delivery date visible before continuing, so the opening state is focused and low-distraction.
  - The item step now uses one full-width product-entry sheet instead of a split pending-PO side panel, so operators can stay in one reading direction while entering qty.
  - Search/add product is now inline at the top of the item screen, with one picker handling only extra non-supplier catalog products before rows are added into the draft.
  - The PO screen now keeps only one add entry point: `Add Product` opens the picker, `Done` commits selected product cards into the PO board, and `Cancel` closes the picker without adding rows.
  - Supplier-history products now live only inside the picker, load in full for the selected supplier, hide products already on the board, and the PO board itself stays limited to the current working rows.
  - Removed the separate purchase-modal product-creation shortcut so PO entry stays focused on selecting catalog items instead of branching into product management.
  - Changing the supplier now resets the current PO rows so the board and picker stay aligned to one supplier at a time.
  - New product picks enter the draft as qty-first rows with inline amount display, edited-price highlighting, and keyboard movement that favors fast row-to-row quantity entry.
  - Rows with qty `0` stay available in the draft but are ignored by review and final submit until the operator enters a meaningful quantity.
  - Delivery date and note editing now stay inside the main item screen instead of forcing a separate extra-fields step.
  - The review step now uses a bill-style layout with supplier/date metadata, short item lines, subtotal, GST, total, and a direct modify path before final submit.
  - Kept current amount, rate, GST, and discount calculation behavior while keeping secondary edits available only when needed.
  - The popup shell was tightened into a more stable working surface with a calmer header/body treatment instead of the older heavier shared-window feel.
  - Added easy draft save/reopen behavior for purchase entry and aligned the restock-to-PO handoff to the same supplier-first process.
  - Replaced visible operator-facing `Distributor` wording with `Supplier` across the updated purchase and restock surfaces where it matches the business meaning.
- Aligned WhatsApp delivery scope with the live implementation:
  - `server/whatsappProvider.js` and the shared WhatsApp send helpers now report manual prepared-message scope honestly instead of implying a send-capable provider from config alone.
  - Purchase WhatsApp handoff stays on the existing `/api/purchase-orders/:id/distributor-whatsapp` route, but the backend/frontend contract now treats it explicitly as manual preparation plus launcher opening rather than automatic delivery.
  - Auth status endpoints now expose WhatsApp delivery scope and send-capability flags separately so diagnostics do not treat config presence as real provider readiness.
- Added supplier novelty alerts in purchase planning:
  - Purchase operations distributor insights now compare supplier product knowledge against the real catalog and the recent store purchase habit window, then expose compact novelty alerts for items missing from catalog or outside recent buying flow.
  - Purchase planning and purchase reminders now flag those novelty items inline without creating a separate supplier-planning endpoint or client-side heuristic model.
- Added a mobile owner quick-actions/tasks view:
  - The admin dashboard now reuses the same purchase summary on small screens for one owner quick-view covering supplier visits, due payments, draft POs, and pending deliveries.
  - Mobile task cards and shortcut buttons stay handoff-only and still open the shared purchase workspace or the existing admin tabs instead of creating a second mobile purchase flow.
- Added a daily cash tally entry independent of billing:
  - Added persisted `daily_cash_tallies` plus admin analytics read/write endpoints for one counted-cash record per day.
  - Daily Sales now keeps billed totals bill-derived while letting admins save counted cash, note the day, and see the delta against billed cash.
  - Dashboard store analytics now uses the current-day cash picture from admin analytics instead of relying on whichever date was last selected in the daily-sales tab.
- Added a tighter final review plus send handoff for purchase orders:
  - Saved purchase orders now stay in the same purchase workspace instead of forcing a jump into the purchase-orders table after save.
  - Inline and popup purchase workspaces both show a shared latest-saved PO handoff with `View PO`, `New PO`, and manual `Prepare WhatsApp` actions.
  - The shared PO detail modal still owns final review and now sits behind the same saved-PO handoff path instead of requiring the orders table as the send entry point.
- Unified the supplier-visit prep flow into one operator-first dashboard surface:
  - Admin dashboard now reuses the full purchase-operations summary so one supplier card can show scheduled supplier context, due amounts, suggested short items, PO draft action, direct payment action, and review/send handoff.
  - Purchase shortcuts now open the shared purchase feature for draft creation, PO payment, or PO review instead of assuming every handoff is a new draft.
  - PO detail now exposes the existing manual WhatsApp preparation action so review/send can happen from the same detail surface opened by the dashboard handoff.
- Aligned credit aging snapshots with the live cycle-based credit logic:
  - Added `model_version` tracking to stored payment-intelligence and aging snapshots.
  - Auto-rebuild stale `/api/credit/aging` reads instead of silently serving old badge/status data.
  - Added an explicit aging-report updating state while stale snapshots rebuild.
  - Added parity coverage between live credit summary output and the stored aging snapshot path.
- Reworked the Products-side restock dashboard into a simpler counted-stock workspace:
  - Shows active products only and removes the extra stock/sync-status filter pair in favor of sortable table headers.
  - Collapses category and product-specific distributor details into the product cell with smaller secondary text instead of separate table columns.
  - Treats the draft value as the dashboard count to sync into `products.stock`, using the existing stock-adjustment API as a one-way dashboard-to-system sync.
  - Keeps stock state simple (`Low Stock` or `Available`) and uses row styling plus mismatch-aware sync actions instead of separate status/last-synced columns.
  - Adds a distributor-scoped handoff into the purchase workspace so selected restock rows can open a draft PO for one distributor.
  - Reuses supplier learning already owned by purchase-order create/receive flows instead of introducing a second supplier-link model.
- Reworked purchase-order creation into a clearer supplier-first workspace:
  - Desktop PO entry now shows the workflow order `Choose Supplier -> Add Items -> Review & Save` instead of leaving the next action implicit.
  - Item entry and row creation stay locked until a valid supplier is selected, and keyboard focus moves into product entry as soon as Step 1 is complete.
  - The review/save area now stays reachable in the PO form instead of forcing repeated up/down scrolling to find the final action.
  - The PO workflow chrome was then simplified to compact step pills, shorter status chips, and icon-led helper actions instead of large descriptive cards and heavier text-button rows.
- Made the purchase browser workspace discoverable and completion-aware:
  - Admin purchase views now expose a visible browser-workspace action instead of relying only on `Alt+P`.
  - Popup/browser purchase mode now keeps a recent-PO panel and latest saved PO context visible when the inline draft closes, so save no longer drops the user into a blank state.
- Added a lightweight restock-to-PO review step inside one combined workspace bar:
  - Search, filters, selection state, sync actions, and the PO review entry now live in one top workspace instead of separate filter and bulk-action surfaces.
  - Selected items open a review surface with editable PO quantities, product units, supplier readiness, optional delivery/note fields, and simple warnings before the purchase handoff.
  - The review stays non-blocking and still opens the shared purchase workspace for final PO creation instead of bypassing that flow.
  - The workspace bar and PO review card were then simplified to minimum helper copy with compact icon-led actions instead of large text-heavy control rows.
- Reworked customer credit due-date and score rules around FIFO-cleared unpaid entries:
  - Kept a stored `due_date` on every credit entry while showing one active due date based on the oldest unpaid FIFO period.
  - Kept customers in `New` until the first judged cycle, then moved them onto the shared status ladder `Excellent -> Very Good -> Good -> Average -> Needs Attention -> Problem -> Defaulter`.
  - Applied status-based due windows for new credit entries: `7 / 15 / 30 / 45 / 60 / 90 / 180` days, with a short `3` day grace rule.
  - Switched the live badge summary to cycle-based downgrade logic, so one failed oldest-unpaid cycle only drops one status step at a time instead of collapsing many unpaid entries straight to `Defaulter`.
  - Added badge-side helper text plus customer-facing reminder copy that explains whether the customer is maintaining or improving status against the current active due date.
- Documented the deployment boundary for `server/core/rateLimiter.js`:
  - Noted that the in-memory limiter is process-local and requires a shared store for multi-instance enforcement.
- Precomputed the admin credit aging report into a summary read model:
  - Added `customer_credit_aging_snapshots` and populate it during payment-intelligence rebuilds.
  - `/api/credit/aging` now reads from snapshots instead of rebuilding from the full ledger.
- Paginated credit-history reads so initial credit-history loads fetch recent entries first, with a "load older entries" control and full-history fetch for report generation:
  - `GET /api/users/:userId/credit-history` now supports cursor pagination and `all=true`.
  - Credit history UI now uses paged loading and only fetches the full ledger when required for reports.
- Added a short-TTL user-id-keyed cache for payment-badge summaries:
  - `/api/users/:userId/payment-badges` now returns a cached payload briefly to avoid recomputing against the full ledger on every read.
- Added the admin "Today Focus" dashboard panel:
  - Dashboard snapshot now pulls credit aging and purchase operations summaries.
  - New panel surfaces customers needing follow-up, outstanding credit, low stock, pending orders, and today’s distributors with quick links.
- Added a simplified customer flow surface:
  - Homepage now shows the "Order → Pick up → Pay" steps.
  - Order confirmation and account page show the customer’s current due balance.
- Expanded supplier planning essentials:
  - Purchase dashboard now shows distributor schedules, payables, and suggested items to order next.
- Added restock guidance in purchase planning:
  - Low-stock items now surface in the purchase dashboard with a quick path to draft a PO.
- Added simple store analytics to the admin dashboard:
  - Cash collected vs udhar given today, vendor dues, and top/slow items now show in the dashboard.
- Added an aging snapshot guard for `/api/credit/aging`:
  - Detects empty/uninitialized snapshot data before filtering and returns `{ status: "initializing" }` with a warning.
- Routed direct network calls through `apiFetch`:
  - `useAdminImportExport` and `useAdminOrderActions` now use centralized fetch helpers to preserve 401 handling.
- Removed native dialogs from purchase hooks:
  - `usePurchaseStatusHandlers` now surfaces confirmations in the UI layer and uses success/error state instead of `alert/confirm`.
- Applied UI-safe error formatting in purchase flows and profile:
  - Purchase handlers and Profile page now use `formatApiError(err)` instead of raw `err.message`.
- Extracted a shared cleanup engine for codebase/worktree cleanup:
  - `scripts/cleanup-engine.js` now owns shared target collection and removal logic while the scripts keep distinct target lists.
- Added a UI-safe API error formatter and migrated the checkout slice:
  - `formatApiError(err)` now lives in shared utilities and the checkout flow uses it instead of raw `err.message`.
- Enforced single-owner session persistence through `SessionProvider`:
  - Session reads/writes/clears now flow through provider methods and the API layer clears via provider hooks instead of mutating storage directly.
- Hardened fallback error rendering:
  - Error boundaries now render fixed generic copy and expose a reporting hook instead of console-only logging.
- Replaced native dialogs in the billing viewer flow:
  - `BillsViewer` now uses inline confirmations/feedback, and helpers no longer rely on `alert`.
- Audited remaining native dialogs:
  - Added `docs/native-dialog-audit.md` with remaining `alert`/`confirm`/`prompt` locations and priorities.
- Hardened public offer preview eligibility handling:
  - `/api/offers/preview` now ignores client-supplied user identifiers and only injects `req.authUser` when present.
- Replaced security-sensitive code generation in `server/features/auth/authSupport.js`:
  - `generateOtpCode()` and `generatePhoneVerificationCode()` now use `crypto.randomInt`.
- Moved live verification hash comparisons onto constant-time helpers:
  - Email/phone verification token checks and legacy SHA-256 comparisons now use timing-safe comparison helpers.
- Fixed env parsing edge cases in `server/loadEnv.js`:
  - Quoted values now preserve ` #` without being truncated.
- Removed the hardcoded repo auth token from `scripts/manual-modal-regression.ps1`:
  - `AdminSessionJson` now loads from args or `ADMIN_SESSION_JSON` and fails fast when missing.
  - Operational follow-up: rotate the auth signing secret if the exposed token is still valid.
- Fixed cold-start readiness polling in `scripts/run-local-smoke-suite.mjs`:
  - Added the missing `delay(ms)` helper so the embedded Postgres retry loop does not throw on first poll failure.
- Extended `scripts/secret-scan.mjs` to catch repo auth tokens:
  - Added a structural pattern for the repo’s two-part base64url token shape.
- Fixed ARIA tablist usage in mobile scrollers:
  - `MobileProductsHeader`, `MobileCategoryHero`, and `MobileTabsSection` now use `role="tab"` with roving `tabIndex` and arrow-key navigation.
- Fixed notification list semantics and interaction patterns:
  - `Header.jsx` now renders a semantic `ul/li` list with non-nested interactions and live feedback roles for status/error text.
- Removed duplicate mobile footer CSS:
  - `.mobile-shop-footer` styles now live only in `src/shared/components/mobile/MobileFooter.css`.
- Reduced credit-history read-path latency:
  - `src/features/credits/history/hooks/useCreditHistoryLoaders.js` now fetches issues and payment badges in parallel after the initial history/balance/customer fan-out instead of serializing that tail.
  - `server/features/credits/routes/creditIssues/creditIssuesList.js` and `server/features/credits/routes/creditIssues/admin/listIssues.js` no longer block issue-list reads on customer-request retention purge; the existing retention worker remains the purge owner.
  - See `CHANGELOG.md` `2026-03-28`.
- Tightened credit-history WhatsApp share fitting:
  - Credit-history WhatsApp sends now trim against the shared full `wa.me` launcher URL limit instead of raw character count, so Assamese report and transaction shares reach prefilled WhatsApp more often before falling back to clipboard paste.
  - See `CHANGELOG.md` `2026-03-28`.
- Tightened customer-facing credit reminder rules:
  - The shared WhatsApp credit reminder now keeps using the canonical `maintain_score_by_date`, never fabricates fallback deadlines, reuses the shared English status label in established-customer reminder copy, and switches to softer score-building copy for `New` / insufficient-history customers instead of implying a mature status band.
  - See `CHANGELOG.md` `2026-03-28`.
- Completed the remaining credit WhatsApp and monthly-statement follow-ups:
  - The shared payment-intelligence summary now exposes the canonical score-preserving date as the earliest unpaid period `due_date`, and customer-facing reminders reuse that field instead of deriving their own deadline.
  - Customer-facing WhatsApp credit messages no longer repeat the score line, only show a repayment nudge when a real due date plus outstanding balance exist, and no longer rely on the trailing footer emoji.
  - The customer credit-history page now includes a derived monthly statement view for clarity while keeping `credit_history`, FIFO settlement, aging, and payment-intelligence badges as the source of truth.
  - See `CHANGELOG.md` `2026-03-28`.
- Fixed WhatsApp credit-message preview/log handling and customer-facing wording:
  - Added grapheme-safe WhatsApp preview truncation on both the frontend launch-log payload and backend audit-log storage path so Assamese text and emoji are not split into replacement characters.
  - Updated shared credit transaction messages to use text-first header/link lines and deliberate Assamese presentation labels instead of raw internal values like `Manual Sale`.
  - See `CHANGELOG.md` `2026-03-28`.
- Added the user-management state contract:
  - Created `docs/user-management-state-contract.md` for role mutation rules, identity edit boundaries, verification pending-state handling, deletion limits, search scalability, and the identity-integrity checklist.
  - Linked that contract from `AGENTS.md`, `docs/frontend.md`, `docs/ui-ux.md`, `docs/business-logic.md`, and `docs/validation.md`.
- Tightened admin user-management UX:
  - `src/shared/components/UserEditModal.jsx` now makes identity fields explicitly read-only in edit mode, clarifies verification/role requirements, uses unrestricted-credit wording for blank `credit_limit`, and waits for list refresh before closing.
  - `src/features/admin/hooks/useAdminUserActions.js` now rethrows refresh failures so edit/create modals do not close on stale user-list state, and create clears the active users search query before reloading page 1.
  - `src/features/admin/sections/UsersSection.jsx` now shows verification state and renders `credit_limit = 0` as unrestricted credit instead of "Not set".
- Implemented the route-policy shell/runtime refactor:
  - `src/App.jsx` now mounts the shared provider tree and `src/RootShell.jsx`.
  - `src/app/routeDefinitions.jsx` now declares route policy together with route components.
  - `src/providers/RoutePolicyProvider.jsx` now resolves the active shell/runtime policy for consumers.
  - `src/shells/DefaultShell.jsx`, `src/shells/AccountShell.jsx`, `src/shells/ImmersiveShell.jsx`, and `src/shells/NoShell.jsx` now own the route-selected chrome variants.
- Implemented the shared overlay/runtime contract:
  - `src/providers/OverlayProvider.jsx` is now the single portal and Escape router.
  - `src/shared/components/window/WindowModal.jsx`, `src/shared/components/window/WindowManagerProvider.jsx`, `src/shared/components/mobile/MobileBottomSheet.jsx`, `src/shared/components/backoffice/BackofficePopupGuard.jsx`, `src/shells/DefaultShell.jsx`, and `src/shared/components/UserMenu.jsx` now register stack entries instead of owning separate global Escape/portal logic.
  - `src/shared/hooks/useInertBackground.js` now uses a ref-counted snapshot/restore model.
- Added the shell/runtime contract gate:
  - `scripts/check-shell-runtime-contract.mjs` now flags portal creation outside `OverlayProvider`, pathname predicate heuristics in blocklisted runtime-owner files, and non-allowlisted shell/runtime DOM writes.
  - `npm run check:shell-runtime` now runs that contract gate as a repo command.
- Added the shell/runtime verification gate:
  - `scripts/test-shell-runtime-contract.mjs` now verifies the pathname false-positive matrix, overlay Escape ordering, and the ref-counted inert lock overlap and restore sequences.
  - `npm run test:shell-runtime` now runs that verification matrix before shell/runtime sign-off.
- Moved shell-owned state out of route prop injection:
  - Added `src/providers/SessionProvider.jsx`, `src/providers/CartProvider.jsx`, and `src/providers/NotificationsProvider.jsx`.
  - Routed consumers now use provider hooks instead of App/route props for session, cart, and notifications.
  - Checkout, reorder, cart, and product add-to-cart flows no longer write `barman_cart` directly outside `CartProvider`.
- Added route-drift and API-wrapper checks to align mounted Express routes and frontend wrappers with `ROUTES.md`.
- Extracted helper modules from `offersRoutes` and `billingSearchRoutes` without changing feature boundaries.
- Standardized shared route error handling with a reusable helper that preserves `error.status`.
- Locked the due-date policy by storing `due_date` on every credit entry, adding `credit_terms_days` defaults, and keeping due dates stable across rebuilds.
- Enforced strict FIFO ordering (`transaction_ts ASC, created_at ASC, id ASC`) for all credit-history queries and required `transaction_ts` in storage.
- Allowed overpayments and stored the remainder as `unapplied_credit` in payment-intelligence snapshots while excluding it from scoring.
- Built the project instruction and memory system at the repo root and under `docs/`.
- Audited the live backend route graph against `ROUTES.md`.
- Verified the backend still follows the feature -> routes -> helpers/services pattern with no `controllers/` introduction.
- Applied safe structural cleanup to selected backend route files without changing business logic.
- Added `docs/workflows/finalization.md` so the required pre-completion and pre-deploy checklist now exists in the repo.
- Re-ran the modal review, removed the stale app-shell close-selector dependency, and removed the last no-op shared modal class from `CreditKhata`.
- Stabilized `WindowModal` registration so shared desktop windows now register through stable manager callbacks instead of re-running lifecycle effects on every provider state change.
- Tightened the shared desktop active-dialog model so only the registered top window exposes modal ARIA semantics and owns the focus trap.
- Updated `src/shared/hooks/useFocusTrap.js` so stacked desktop windows no longer restore focus back to the background on active-window handoffs.
- Replaced `src/shared/components/window/WindowModal.css` with inline Tailwind utility classes across the shared desktop backdrop, dock, frame, header, controls, body, and resize handles while preserving feature override hooks.
- Hardened `scripts/manual-modal-regression.ps1` so the modal browser regression re-syncs admin session state, waits on real app-shell readiness, uses an isolated Chrome profile per run, and verifies desktop drag through in-page pointer events.
- Updated `.gitignore`, `scripts/cleanup-codebase.js`, and `scripts/cleanup-worktree.js` so `.tmp/` is treated as disposable local test output and the cleanup passes no longer leave stale modal-regression artifacts behind.
- Fixed product offer badge decoration so active badge lists are de-duplicated and no longer truncated before all applicable offers are exposed.
- Fixed the broken lifecycle status badge class binding in `src/features/marketing/components/OfferLibraryTable.jsx`.
- Reworked credit-history payment badges so they now sit inside the balance card in a larger highlighted block, and moved the "How it works" explanation into a click-open `?` tooltip with clearer pointwise guidance.
- Refined credit-history balance-card badges so only the highlighted badge visuals remain, moved them to a simple right-side coin cluster, and styled them as circular 3D tokens while keeping the `?` rules tooltip.
- Reworked customer credit scoring so credit-history badges, the admin aging report, and WhatsApp credit messages now share the same FIFO-based `0-100` payment score bands.
- Added admin-managed manual customer credit limits to the user create/edit flow without loosening the existing verified-contact requirement for role changes.
- Brought `src/shared/components/mobile/MobileBottomSheet.jsx` up to the same shared portal, focus-trap, and background-isolation model as the desktop modal runtime.
- Consolidated modal-related `.fade-in-up` ownership back to the shared utility and renamed the user-menu-specific dropdown animation so it no longer collides with shared modal motion.
- Added `scripts/manual-modal-regression.ps1` and `npm run test:modal-regression` so the shared modal regression pass can boot local services, verify stacked desktop windows plus mobile sheets, and clean up automatically.
- Updated `docs/workflows/finalization.md` so modal-shell changes explicitly require the browser regression pass before sign-off or deployment.
- Filtered expected embedded-Postgres teardown noise from `scripts/run-local-smoke-suite.mjs` so successful smoke runs no longer print misleading `ECONNRESET` shutdown warnings.
- Fixed `scripts/windows/git-maintain.bat` and `scripts/windows/workbench.bat` so quick-commit flows keep spaced commit messages intact and non-interactive mode does not hang on a prompt.
- Cleaned up credit UX/report inconsistencies by standardizing score-band ranges, surfacing `New`/`Defaulter` state explicitly, and aligning tooltip/help text with the shared scoring contract.
- Implemented customer payment-intelligence foundation for credits using a derived `customer_payment_periods` model and a cached score snapshot.
- Locked the deterministic payment-period allocation contract:
  - `credit_history` remains the source of truth.
  - `customer_payment_periods` is derived only and must never be edited manually.
  - FIFO allocation order is `transaction_ts ASC, created_at ASC, id ASC`.
  - Every rebuild must reset allocations and replay the full ledger for that customer.
  - Missed status is `today > due_date + grace_days && remaining_amount > 0`.
  - Delay is derived from `settled_at` or `today`, clamped to `>= 0`.
  - New customers with fewer than 2 evaluated periods fall back to score `50`, but must be treated as `New` / `insufficient_history` rather than ordinary `Good`.
- Added backend scoring factors and guardrails:
  - `Active Status` up to `30`
  - `Payment Discipline` up to `40`
  - `Missed Payments` down to `-30`
  - `Delay Behavior` down to `-20`
  - Normalize to `0-100`, then apply badge caps for missed periods and inactive customers.
- Standardized score-band definitions from one shared source of truth and reuse them across backend summaries, dashboard rendering, tooltips, and customer-facing badge help text:
  - `Excellent` = `80-100`
  - `Very Good` = `60-79`
  - `Good` = `40-59`
  - `Needs Attention` = `20-39`
  - `Problem` = `0-19`
- Separated `New` from scored customer quality in the badge model and UI:
  - keep fallback score `50` only as an internal scoring default
  - expose `New` as a distinct label/state for customers with insufficient history
  - stop presenting `New` customers as plain `Good`
- Split severe `Problem` cases from true chronic defaulters using an internal tag:
  - add derived `is_defaulter = missed_periods >= 2 || oldest_overdue_days > 60`
  - keep the main badge as `Problem`
  - render a secondary `Defaulter` tag where appropriate for dashboards, summaries, and follow-up workflows
- Added derived period fields for each payable period:
  - `expected_amount`
  - `allocated_amount`
  - `remaining_amount`
  - `is_fully_settled`
  - `settled_at`
- Added a payment-intelligence rebuild path after every credit-impacting mutation:
  - manual payment/create
  - credit edit
  - reversal
  - credit issue correction
  - bill-created credit
- Added a daily rebuild job for overdue rollovers and score degradation after due/grace thresholds pass.
- Extended existing credit APIs and dashboards to expose grouped customer quality metrics, follow-up counts, defaulter counts, and badge breakdowns without introducing parallel route families.
- Shifted the credit aging dashboard to a customer-quality-first layout with customer health breakdowns, defaulter/follow-up cards, badge-first presentation, action flags, risk-labeled aging buckets, and click-to-filter controls.
- Added compact filter summary chips, a Reset Filters header action, and per-row View/Follow Up actions in the credit aging dashboard.
- Simplified the credit history balance-card badge to a single label + score, removed helper text and multi-badge coins, updated badge colors, and replaced the tooltip copy with the detailed guidance text.
- Implemented circular 3D payment badge styling with score-first hierarchy on mobile, contrast-safe palettes, and responsive sizing for the credit history header.
- Hardened the WhatsApp launcher flow:
  - Added a WhatsApp launch audit endpoint and client logging payloads with status naming, context fields, and trigger source.
  - Updated WhatsApp status naming across billing and credit flows.
  - Added report trimming to respect WhatsApp line/length limits before fallback.
  - Formalized launcher branding rules in `docs/whatsapp-branding.md` and aligned templates to the header/footer contract.
  - Added payment-profile contract fields (`score`, `label`, `tag`, `status`) and null-score handling for launcher templates.
- Locked the balance/badge consistency contract across UI and WhatsApp, and added a full balance + badge state matrix for admin/customer verification.
- Added balance card guardrails: clamp near-zero balances, hide scores for `New`, and suppress last-transaction lines older than 30 days.

## Notes

- Before any backend change, re-read `ARCHITECTURE.md`, `ROUTES.md`, and `AGENTS.md`.
- Preserve compatibility endpoints, aliases, and dual `GET`/`POST` internal routes unless a task explicitly includes a migration plan.
