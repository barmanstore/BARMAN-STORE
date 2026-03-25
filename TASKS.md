# Tasks

Use this file for cross-session task tracking only.

## Active

- None currently.

## Next

- Add a CI script that compares the mounted Express routes to `ROUTES.md` and fails on drift.
- Gradually extract helper files from oversized route modules such as `server/features/commerce/routes/offersRoutes.js` and `server/features/sales/routes/billingSearchRoutes.js` without changing the feature-based architecture.
- Standardize a shared route-error helper so more backend routes preserve `error.status` consistently.
- Add a lightweight check that flags frontend API wrapper endpoints missing from `ROUTES.md`.

## Blocked

- None currently.

## Done

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
- Brought `src/shared/components/mobile/MobileBottomSheet.jsx` up to the same shared portal, focus-trap, and background-isolation model as the desktop modal runtime.
- Consolidated modal-related `.fade-in-up` ownership back to the shared utility and renamed the user-menu-specific dropdown animation so it no longer collides with shared modal motion.
- Added `scripts/manual-modal-regression.ps1` and `npm run test:modal-regression` so the shared modal regression pass can boot local services, verify stacked desktop windows plus mobile sheets, and clean up automatically.
- Updated `docs/workflows/finalization.md` so modal-shell changes explicitly require the browser regression pass before sign-off or deployment.
- Filtered expected embedded-Postgres teardown noise from `scripts/run-local-smoke-suite.mjs` so successful smoke runs no longer print misleading `ECONNRESET` shutdown warnings.
- Fixed `scripts/windows/git-maintain.bat` and `scripts/windows/workbench.bat` so quick-commit flows keep spaced commit messages intact and non-interactive mode does not hang on a prompt.

## Notes

- Before any backend change, re-read `ARCHITECTURE.md`, `ROUTES.md`, and `AGENTS.md`.
- Preserve compatibility endpoints, aliases, and dual `GET`/`POST` internal routes unless a task explicitly includes a migration plan.
