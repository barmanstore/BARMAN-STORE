# Changelog

Use one dated section per completed change set.

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

- Live route audit: 170 mounted backend routes, 0 duplicate `METHOD + path`, and no drift between runtime routes and `ROUTES.md`.
- Static reachability audit: no orphaned backend route modules under `server/features/**/routes/**`.
- `node --check` passed for the touched backend route files and the touched frontend API wrapper files.
- Backend governance audit confirmed routes are still mounted through the official `appFactory -> registerFeatures -> bootstrap -> feature` chain and not through ad hoc registration.
- Compatibility checks confirmed the intentional `410` endpoints, distributor ledger aliases, and dual `GET`/`POST` internal automation routes remain preserved.
- Post-fix runtime route check still boots the app cleanly and reports 0 duplicate top-level registrations; the quick count is 171 when including the global `OPTIONS *` route that sits outside the documented business API inventory.
- `node --check` also passed for `server/utils/distributorLedgerUtils.js`, `server/features/credits/routes/creditIssues/creditIssuesAdmin.js`, `server/features/auth/routes/userCrud/userProfileUpdates.js`, `server/features/sales/routes/orderStatusRoutes.js`, `src/shared/services/api/distributorLedger.js`, and `src/shared/services/api/core.js`.
- A fresh route audit matched 174 documented routes to 174 mounted routes, with 0 undocumented routes, 0 missing documented routes, and 0 duplicate `METHOD + path` registrations.
- `scripts/manual-modal-regression.ps1` passed locally on 2026-03-24 against `http://127.0.0.1:3000` and `http://127.0.0.1:5000`, including automated startup and teardown of the required local services.
