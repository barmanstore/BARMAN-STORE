# Tasks

Use this file for cross-session task tracking only.

## Active

- None currently. Route inventory and architecture docs are aligned with the backend as of 2026-03-24.

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
- Fixed product offer badge decoration so active badge lists are de-duplicated and no longer truncated before all applicable offers are exposed.
- Fixed the broken lifecycle status badge class binding in `src/features/marketing/components/OfferLibraryTable.jsx`.
- Brought `src/shared/components/mobile/MobileBottomSheet.jsx` up to the same shared portal, focus-trap, and background-isolation model as the desktop modal runtime.
- Consolidated modal-related `.fade-in-up` ownership back to the shared utility and renamed the user-menu-specific dropdown animation so it no longer collides with shared modal motion.

## Notes

- Before any backend change, re-read `ARCHITECTURE.md`, `ROUTES.md`, and `AGENTS.md`.
- Preserve compatibility endpoints, aliases, and dual `GET`/`POST` internal routes unless a task explicitly includes a migration plan.
