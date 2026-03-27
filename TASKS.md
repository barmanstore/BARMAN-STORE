# Tasks

Use this file for cross-session task tracking only.

## Active

- None currently.

## Next

- None currently.

## Blocked

- None currently.

## Done

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

## Notes

- Before any backend change, re-read `ARCHITECTURE.md`, `ROUTES.md`, and `AGENTS.md`.
- Preserve compatibility endpoints, aliases, and dual `GET`/`POST` internal routes unless a task explicitly includes a migration plan.
