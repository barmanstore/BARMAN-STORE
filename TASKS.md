# Tasks

Use this file for cross-session task tracking only.

## Active

### UX & Accessibility

None.

### Ops & Scripts

None.

### Backend & Security

None.

### Frontend Platform

None.

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
