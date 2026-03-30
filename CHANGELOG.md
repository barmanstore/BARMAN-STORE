# Changelog

Use one dated section per completed change set.

## 2026-03-28

### Changed

- `src/shared/components/UserEditModal.jsx`, `src/shared/components/UserEditModal.css`, `src/features/admin/hooks/useAdminUserActions.js`, `src/features/admin/hooks/useAdminPageController.js`, and `src/features/admin/sections/UsersSection.jsx` now keep admin user edits aligned to the backend contract: identity fields stay read-only in edit mode, role gating explains pending verification, blank credit limit means unrestricted credit, user-list refresh is awaited before modal close, and customer cards now show verification state plus unrestricted-credit wording.
- `src/App.jsx`, `src/RootShell.jsx`, `src/app/appRoutes.jsx`, and `src/app/routeDefinitions.jsx` now use a route-policy-driven shell contract instead of App-level prop injection and pathname-owned chrome heuristics.
- Added provider-owned global state in `src/providers/SessionProvider.jsx`, `src/providers/CartProvider.jsx`, `src/providers/NotificationsProvider.jsx`, `src/providers/RoutePolicyProvider.jsx`, and `src/providers/OverlayProvider.jsx`, and moved routed consumers onto those hooks.
- Added explicit shell renderers in `src/shells/DefaultShell.jsx`, `src/shells/AccountShell.jsx`, `src/shells/ImmersiveShell.jsx`, and `src/shells/NoShell.jsx`; `src/shared/components/AppShell.jsx` now aliases the default shell instead of owning route decisions.
- Cart writes in storefront, checkout, and reorder flows now go through `CartProvider` operations instead of direct `barman_cart` writes in route components.
- Shared overlay ownership now flows through `OverlayProvider`: `WindowModal`, `WindowManagerProvider`, `MobileBottomSheet`, `BackofficePopupGuard`, the mobile menu, and `UserMenu` dropdowns no longer own separate portal/Escape/inert stacks.
- `src/shared/hooks/useInertBackground.js` now uses a ref-counted first-lock snapshot / last-unlock restore model with a development warning when the shell background-root marker is missing.
- Added `src/providers/overlayStackUtils.mjs` and `src/shared/hooks/inertBackgroundRuntime.mjs` so overlay ordering and inert-lock restore logic now have shared pure helpers used by both runtime code and verification.
- Added `scripts/check-shell-runtime-contract.mjs` and `scripts/test-shell-runtime-contract.mjs`, plus `npm run check:shell-runtime` and `npm run test:shell-runtime`, to enforce the shell/runtime ownership contract and verify the pathname, overlay-ordering, and inert-lock matrices.
- `shared/messageTemplates.{js,cjs}` now keep credit WhatsApp messages text-first in the header and store-link lines and map internal credit entry labels like `Manual Sale` through deliberate customer-facing Assamese wording instead of raw ledger labels.
- `server/features/credits/utils/creditBadges.js` now exposes `maintain_score_by_date` as the earliest unpaid period `due_date`, and the customer credit-history page now renders a derived monthly statement view from the existing ledger instead of treating monthly summaries as a separate source of truth.
- `shared/messageTemplates.{js,cjs}` now keep credit reminder copy contract-driven by the canonical `maintain_score_by_date`, never fabricate fallback deadlines, and use softer score-building wording for `New` / insufficient-history customers.

### Fixed

- Mobile products no longer write the legacy `mobile-shop-active` body class; the immersive shell now owns the zero-padding layout directly through shell classes instead of feature-side body toggles.
- `src/features/credits/history/hooks/useCreditHistoryLoaders.js` now fetches credit issues and payment badges in parallel after the initial credit-history load fan-out, and the credit issue list read routes now rely on the existing retention worker instead of awaiting customer-request purge inside each request.
- `src/features/credits/history/hooks/useCreditHistoryReports.js`, `server/features/credits/routes/creditLedger/creditLedgerWhatsAppLogs.js`, `shared/textPreview.{js,cjs}`, and `src/shared/utils/textPreview.js` now build grapheme-safe WhatsApp message previews so Assamese text and emoji are not split into replacement characters in launch logs or audit previews.
- `shared/messageTemplates.{js,cjs}` no longer repeat payment-score text inside customer-facing credit message bodies, only show a repayment nudge when a real due date plus outstanding balance exist, and no longer append the trailing footer emoji that could render as a broken glyph.
- `src/shared/utils/whatsapp.js` and `src/features/credits/history/hooks/useCreditHistoryReports.js` now measure credit-history WhatsApp share size against the same full `wa.me` URL contract the launcher enforces, and trim optional lines like reference/store-link text before falling back to clipboard-only sharing.
- `shared/messageTemplates.{js,cjs}` now use the shared English status label directly in established-customer reminder copy, for example `আপোনাৰ Excellent স্কোৰ বজাই ৰাখিবলৈ ...`, instead of generic `ভাল স্কোৰ` wording.

### Docs

- Added `docs/user-management-state-contract.md` and linked it from `AGENTS.md`, `docs/frontend.md`, `docs/ui-ux.md`, `docs/business-logic.md`, and `docs/validation.md` so the user-management UI, validation, and business rules now share one documented contract.
- Updated `ARCHITECTURE.md`, `docs/frontend.md`, and `docs/ui-ux.md` to describe the route-policy provider, shell variants, provider-owned state, and shared overlay runtime.
- Updated `docs/business-logic.md` to clarify the permanent password-auth `410` stubs, the intentional frontend-local cart boundary, the purchase-order lifecycle verification guardrail, offer cache and checkout recomputation behavior, and the credit `due_date` / rebuild invariants.
- Updated `docs/workflows/finalization.md` so shell/runtime changes now require the contract check and verification matrix before sign-off.
- Updated `TASKS.md` to move the completed shell/runtime refactor items out of the active queue and close the remaining user-management follow-ups.
- Updated `docs/whatsapp-branding.md` to require text-first preview lines, decorative-only emoji, grapheme-safe preview truncation, and presentation mapping for customer-facing ledger labels.
- Updated `docs/business-logic.md`, `docs/frontend.md`, `docs/whatsapp-branding.md`, and `TASKS.md` to record the canonical score-preserving due date, the presentation-only monthly statement view, and the new credit-message reminder/body rules.
- Updated `docs/whatsapp-branding.md` and `TASKS.md` again to make the “no fabricated deadline” rule explicit and record the state-aware reminder copy for `New` customers.
- Updated `docs/whatsapp-branding.md` and `TASKS.md` to document that credit-history WhatsApp trimming must follow the shared full-URL launcher limit instead of raw character counts.

### Verification

- `node --check server/features/credits/utils/creditBadges.js`
- `node --check shared/messageTemplates.cjs`
- `npm run build`
- `npm run check:shell-runtime`
- `npm run test:shell-runtime`
- `npm run test:credit-ui`
- `npm run test:order-flow` reached the smoke harness and reported a guarded skip because `SMOKE_TEST_DB_URL` is not set and the harness refused to use the primary app database.

## 2026-03-27

### Changed

- `server/features/credits/utils/creditBadges.js` now derives credit-aging and payment badges from FIFO settlement analysis, producing a shared `0-100` payment score, status band, aging buckets, and limit-status metadata instead of the older independent Gold/Silver/Bronze/Streak heuristics.
- `server/features/credits/routes/creditIssues/creditIssuesList.js` and `server/features/credits/routes/creditLedger/creditLedgerReports.js` now return the shared payment-score output so credit-history badges and the admin aging report stay aligned.
- `src/features/credits/history/components/CreditHistoryHeader.jsx`, `src/features/credits/reports/CreditAgingReport.jsx`, and `shared/messageTemplates.{js,cjs}` now surface the new payment score, status band, and manual credit-limit context in the badge UI, aging report, and WhatsApp credit messages.
- `src/shared/components/UserEditModal.jsx`, `server/features/auth/routes/userCrud/userRoleActions.js`, and `server/features/auth/routes/userCrud/profile/*` now let admins set manual customer credit limits while keeping role-change verification rules intact.
- `supabase/migrations/20260327110000_credit_payment_intelligence.sql`, `server/features/credits/utils/paymentIntelligence.js`, and the credit mutation routes now add the first derived payment-period/snapshot layer, rebuild it after credit-impacting writes, and expose an internal daily rebuild route at `/api/internal/credits/payment-intelligence/run`.
- `server/features/credits/utils/creditBalances.js` no longer starts a nested transaction for balance rebuilds, so credit balance recalculation and payment-intelligence rebuilds can run inside the same outer write transaction.
- Payment status rendering now distinguishes `New` customers from scored badges and surfaces a `Defaulter` tag for severe non-payment cases, with consistent score-band ranges sourced from `shared/creditScoreBands.json`.
- Credit entries now store a required `due_date`, use strict FIFO ordering (`transaction_ts ASC, created_at ASC, id ASC`), and allow overpayments while tracking excess as `unapplied_credit` without scoring impact.
- Route utilities were extracted from `offersRoutes` and `billingSearchRoutes`, and shared route error handling now lives in `server/core/routeErrors.js`.
- New route consistency checks validate mounted Express routes and frontend API wrappers against `ROUTES.md` via `npm run check:routes` and `npm run check:api-wrappers`.
- Sales feature bootstrap now passes credit helpers into billing creation so credit-profile defaults are available during bill-linked credit writes.

### Fixed

- Customer payment snapshot insert placeholders no longer fail during order-linked billing in Postgres.

### Docs

- `ROUTES.md` now documents the internal payment-intelligence rebuild route.
- `docs/business-logic.md` now records that credit-history badges, aging output, and WhatsApp credit messaging all depend on the shared payment-intelligence scoring plus the derived payment-period rebuild path.
- `docs/validation.md` now records the admin-only customer credit-limit validation path, the `credit_limit >= 0` rule, and that payment-period state remains server-derived only.
- `docs/business-logic.md` now documents the `New`/`Defaulter` semantics for credit badges.

### Verification

- `node --check server/features/credits/utils/creditBadges.js`
- `node --check server/features/credits/utils/paymentIntelligence.js`
- `node --check server/features/credits/routes/creditLedger/creditLedgerReports.js`
- `node --check server/features/credits/routes/creditIssues/creditIssuesList.js`
- `node --check server/features/credits/routes/creditLedger/creditPaymentIntelligenceJob.js`
- `node --check server/features/credits/routes/creditLedger/adjustments/createRoutes.js`
- `node --check server/features/credits/routes/creditLedger/adjustments/updateRoutes.js`
- `node --check server/features/credits/routes/creditLedger/adjustments/deleteRoutes.js`
- `node --check server/features/credits/routes/creditIssues/admin/resolveIssue.js`
- `node --check server/features/auth/routes/userCrud/userRoleActions.js`
- `node --check server/features/auth/routes/userCrud/profile/profileValidation.js`
- `node --check server/features/auth/routes/userCrud/profile/profileUpdateFlow.js`
- `node --check server/core/bootstrap/featureRegistrars/creditFeature.js`
- `node --check server/appFactory/registerFeatures/creditDeps.js`
- `node --check server/appFactory/registerFeatures/salesDeps.js`
- `node --check server/features/sales/routes/billingCreate/billPersist.js`
- `node --check server/features/credits/creditUtils.js`
- `node --check shared/messageTemplates.cjs`
- `npm run build`
- `npm run test:credit-ui`
- `npm run check:routes`
- `npm run check:api-wrappers`

## 2026-03-25

### Changed

- `src/shared/components/window/WindowModal.jsx` now registers open desktop windows through stable manager callbacks instead of depending on the mutable window-manager context object in its lifecycle effects.
- `src/shared/components/window/WindowModal.jsx` now derives dialog semantics from the registered top window only, keeping inactive or not-yet-registered desktop windows out of the accessible dialog path.
- `src/shared/hooks/useFocusTrap.js` now supports preserving focus inside a stacked window system during active-window handoffs while still restoring prior focus on close or unmount.
- `src/shared/components/window/WindowManagerProvider.jsx` and `src/shared/components/window/WindowModal.jsx` now express the shared desktop window shell through inline Tailwind utility classes instead of the deleted `src/shared/components/window/WindowModal.css`.
- `src/features/credits/khata/CreditKhata.jsx` now passes direct utility padding classes to `WindowModal` instead of relying on the removed shared `window-modal-body-padded` helper class.
- `scripts/manual-modal-regression.ps1` now re-syncs the admin session after page navigation, waits on page readiness instead of a brittle icon-button count, uses an isolated Chrome profile per run, and drives the desktop drag assertion through in-page pointer events so reruns stay deterministic.
- `.gitignore`, `scripts/cleanup-codebase.js`, and `scripts/cleanup-worktree.js` now treat `.tmp/` as disposable local artifact output so modal-regression leftovers are ignored and can be cleaned by the standard worktree/code cleanup passes.

### Fixed

- Shared desktop window registration no longer tears down and re-registers open windows on ordinary provider updates.
- Shared desktop ARIA exposure and focus ownership now stay aligned to the registered top window instead of temporarily treating unregistered windows as active dialogs.
- Focus restoration no longer bounces back to background content when one desktop window yields top-window status to another.
- `npm run test:modal-regression` no longer stalls on the shared app loading shell or fail a false-negative desktop drag check during the modal regression pass.
- `npm run cleanup:code` and `npm run cleanup:worktree` no longer leave `.tmp/` modal-regression output behind as an unmanaged artifact.
- `npm run server` now loads `.env` and related project env files through `server/loadEnv.js` before app bootstrap, so local backend startup picks up `PORT`, `SUPABASE_DB_URL`, `FRONTEND_ORIGIN`, and auth settings consistently.
- Frontend routes that use shared message-template helpers no longer crash in Vite dev with `module is not defined`; the browser now imports a real ESM copy from `shared/messageTemplates.js` instead of executing the raw CommonJS `shared/messageTemplates.cjs`.

### Docs

- `docs/shared-modal-window-review.md` now reflects the implemented 2026-03-25 shared desktop window fixes, the inline Tailwind shell migration, and the current verification status.
- `TASKS.md` now marks the shared desktop window follow-ups and the modal-regression harness stabilization work as done instead of leaving the browser rerun listed as pending.
- `.env.example` now mirrors the cleaned local `.env` layout, including the localhost Supabase auth, localhost verification redirect defaults, and grouped local-dev config sections without embedding secrets.
- `shared/messageTemplates.js` now documents why the frontend keeps a browser-facing ESM copy aligned with the CommonJS server helper.

### Verification

- `npm run build`
- `npm run cleanup:code`
- `npm run cleanup:worktree`
- `npm run test:modal-regression`
- `npm run db:supabase:check`
- `node -` requiring `server/index.js` confirmed the runtime now sees `.env` values for `PORT`, `SUPABASE_DB_URL`, and `FRONTEND_ORIGIN`
- `npm run build`

## 2026-03-24

### Added

- Root project memory docs: `AGENTS.md`, `ROUTES.md`, `ARCHITECTURE.md`, `ERROR_HANDLING.md`, `CHANGELOG.md`, and `TASKS.md`.
- Focused project docs under `docs/` covering backend, frontend, routing, controllers, services, database, validation, API contracts, UI/UX, patterns, anti-patterns, and naming conventions.
- `scripts/manual-modal-regression.ps1` plus `npm run test:modal-regression` for a reusable browser regression pass that exercises stacked desktop modals, mobile sheets, focus containment, background inertness, and reduced-motion behavior.

### Changed

- `AGENTS.md` now enforces re-reading `ROUTES.md` before backend changes and points future work to the correct architecture docs.
- `server/features/auth/routes/phoneChangeRoutes.js` was aligned to the feature-route conventions by trimming unused injected deps and keeping the compatibility endpoints intact.
- `server/features/auth/routes/userVerificationAdminRoutes.js` was aligned the same way while preserving the intentional `410` password-reset compatibility endpoints.
- `server/features/sales/routes/orderCreateRoutes.js` now preserves explicit downstream `error.status` values instead of flattening all failures to `400`.
- `server/features/sales/routes/orderStatusRoutes.js`, `server/features/credits/routes/creditIssues/creditIssuesAdmin.js`, and `server/features/auth/routes/userCrud/userProfileUpdates.js` now preserve helper-thrown HTTP status codes instead of flattening typed errors into generic route responses.
- `server/utils/distributorLedgerUtils.js` now throws typed `400`/`404` validation errors for distributor-ledger creation so alias endpoints keep the correct status contract.
- `src/shared/services/api/core.js` now attaches `status` and `payload` when a backend endpoint unexpectedly returns non-JSON, keeping frontend error propagation consistent.
- `src/features/notifications/hooks/useNotificationsInbox.js` now centralizes notification payload normalization and surfaces inbox refresh, pagination, recipient-load, and mark-read failures through returned hook state instead of silent catches.
- `src/shared/services/api/orders.js` and `src/shared/services/api/stats.js` were trimmed to live, documented endpoints only, and the dead `cartApi` wrapper/export was removed because cart state is frontend-local.
- `TASKS.md` now tracks the next governance follow-ups for route drift checks, large route-module extraction, shared route-error handling, and stale frontend API wrapper cleanup.
- `src/App.jsx` now limits the app-shell Escape fallback to the active shared modal close contract instead of carrying legacy `.invoice-close-btn` and `.close-btn` selectors.
- `src/features/credits/khata/CreditKhata.jsx` no longer passes the legacy `modal-content` dialog class into `WindowModal`.
- `server/features/offers/offerEngine.js` now returns the full de-duplicated badge set for decorated products instead of truncating product offer badges at three labels inside the backend response.
- `src/shared/components/mobile/MobileBottomSheet.jsx` now portals to `document.body`, traps focus, and uses the shared inert-background model instead of behaving like an inline sheet with body-lock only.
- `src/shared/hooks/useInertBackground.js` now reference-counts shared background isolation so stacked shared surfaces do not restore the page too early.
- Modal-related `.fade-in-up` ownership now lives in `src/App.css`, while `src/shared/components/UserMenu.css` uses a dedicated dropdown-enter animation instead of redefining the shared selector.

### Fixed

- Backend route inventory was re-verified against the live Express app: no undocumented routes, no missing documented routes, and no duplicate `METHOD + path`.
- Frontend API drift was corrected in `src/shared/services/api/admin.js`, `src/shared/services/api/categories.js`, `src/shared/services/api/credit.js`, and `src/shared/services/api/notifications.js`.
- Several backend route files were cleaned structurally without changing business logic: `resetModeRoutes.js`, `offersRoutes.js`, `purchaseOperationsRoutes.js`, `mediaProxyRoutes.js`, and `purchaseOperationNotificationRoutes.js`.
- Distributor-ledger fallback detection in `src/shared/services/api/distributorLedger.js` now recognizes real `404` responses instead of relying only on message text.
- Distributor-ledger create endpoints under `/api/distributor-ledger`, `/api/distributors/ledger`, and distributor-specific ledger aliases no longer misclassify missing distributors as `400`.
- `src/features/marketing/components/OfferLibraryTable.jsx` now reads lifecycle badge tone from `lifecycleMeta`, fixing a broken render path caused by an undefined `meta` reference.
- The shared modal review in `docs/shared-modal-window-review.md` was refreshed after the cleanup pass so its remaining findings now match the current code.
- `scripts/cleanup-smoke-test-data.js` now honors `SMOKE_TEST_DB_URL` and `PHONE_TEST_DB_URL` before building its Postgres pool, so smoke cleanup no longer targets the primary configured database during local suites.
- The final shared modal follow-ups are now closed: the mobile sheet isolation gap is fixed and the competing modal-specific `.fade-in-up` definitions were removed.
- `scripts/run-local-smoke-suite.mjs` now ignores expected embedded-Postgres connection-reset noise during shutdown, so successful smoke runs no longer end with misleading teardown warnings.
- `scripts/windows/git-maintain.bat` and `scripts/windows/workbench.bat` now preserve commit messages with spaces and no longer block non-interactive quick-commit mode on an unexpected prompt.

### Docs

- `ROUTES.md` remains the backend source of truth and now cross-links to the new architecture and routing docs.
- `ARCHITECTURE.md` documents the React SPA shell, backend registration chain, Postgres-only data layer, and cross-cutting dependencies like offers and purchase lifecycle status.
- `ERROR_HANDLING.md` documents JSON/status expectations and current compatibility exceptions.
- `TASKS.md` now records the current backend alignment state, remaining low-risk follow-up work, and the requirement to re-read `ARCHITECTURE.md`, `ROUTES.md`, and `AGENTS.md` before backend changes.
- `docs/business-logic.md`, `docs/frontend.md`, `docs/services.md`, and `ARCHITECTURE.md` now document that cart is frontend-local, `useNotificationsInbox` is part of the controller-hook pattern, and frontend API wrappers must not invent undocumented backend endpoints.
- `docs/workflows/finalization.md` now defines the required smoke, health, route-consistency, cleanup, docs-sync, readiness, and reporting workflow before sign-off or deployment.
- `docs/workflows/finalization.md` now explicitly requires `npm run test:modal-regression` when shared modal-shell code changes.
- `docs/shared-modal-window-review.md` now reflects the post-fix state of the shared modal stack instead of the original stale findings.
- `TASKS.md` no longer tracks the modal parity and shared fade-utility cleanup items as pending because both are now implemented.

### Verification

- Early live route audit before the final same-day route/doc alignment pass: 170 mounted backend routes, 0 duplicate `METHOD + path`, and no drift between runtime routes and `ROUTES.md` in that snapshot.
- Static reachability audit: no orphaned backend route modules under `server/features/**/routes/**`.
- `node --check` passed for the touched backend route files and the touched frontend API wrapper files.
- Backend governance audit confirmed routes are still mounted through the official `appFactory -> registerFeatures -> bootstrap -> feature` chain and not through ad hoc registration.
- Compatibility checks confirmed the intentional `410` endpoints, distributor ledger aliases, and dual `GET`/`POST` internal automation routes remain preserved.
- Post-fix runtime route check still boots the app cleanly and reports 0 duplicate top-level registrations; the quick count is 171 when including the global `OPTIONS *` route that sits outside the documented business API inventory.
- `node --check` also passed for `server/utils/distributorLedgerUtils.js`, `server/features/credits/routes/creditIssues/creditIssuesAdmin.js`, `server/features/auth/routes/userCrud/userProfileUpdates.js`, `server/features/sales/routes/orderStatusRoutes.js`, `src/shared/services/api/distributorLedger.js`, and `src/shared/services/api/core.js`.
- Final same-day route audit after completing the remaining route/doc alignment work matched 174 documented routes to 174 mounted routes, with 0 undocumented routes, 0 missing documented routes, and 0 duplicate `METHOD + path` registrations.
- `scripts/manual-modal-regression.ps1` passed locally on 2026-03-24 against `http://127.0.0.1:3000` and `http://127.0.0.1:5000`, including automated startup and teardown of the required local services.

## 2026-03-29

### Changed

- `GET /api/users/:userId/credit-history` now supports cursor pagination with `limit`/`cursor`, plus `all=true` for full history reads, so initial ledger views load recent entries first.
- `/api/credit/aging` now reads from precomputed `customer_credit_aging_snapshots` instead of rebuilding payment intelligence on every request.

### Added

- `customer_credit_aging_snapshots` stores precomputed credit aging summaries for admin reads.

### Ops Note

- After applying `20260329120000_credit_aging_snapshots.sql`, run the payment-intelligence rebuild to populate snapshots. Aging results remain incomplete until the rebuild completes.
