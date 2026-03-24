# Finalization Workflow

Execute this checklist before marking work done or preparing a deployment.

## Smoke Test

- Run the repo smoke suite:
  - `cmd /c scripts\\windows\\health-check.bat smoke`
  - or `node scripts/run-local-smoke-suite.mjs all`
- Verify the core flows covered by the current suite:
  - OTP auth endpoints
  - product listing
  - order creation through `POST /api/orders/create-validated`
  - purchase flow
  - shared modal behavior, including open, drag, and close
- Treat any smoke failure as a release blocker until the cause is understood.

## Health Check

- Backend:
  - boot the app successfully
  - confirm there are no route registration failures
  - confirm touched handlers still resolve correctly
- Frontend:
  - confirm touched API calls still point to live backend routes from `ROUTES.md`
  - run `npm run build`

## Route Consistency

- Re-read `ROUTES.md` before signing off backend or API-wrapper changes.
- Compare runtime-mounted routes with `ROUTES.md`.
- Confirm:
  - no undocumented live routes
  - no missing documented routes
  - compatibility routes marked deprecated still return `410` where documented

## Code Cleanup

- Remove unused imports, dead branches, and debug-only logging added by the task.
- Keep route files inside the current feature-boundary architecture.
- Prefer helper extraction over further growth when a route module becomes too large.

## Worktree Cleanup

- Run:
  - `git status --short`
  - `npm run cleanup:code`
  - `npm run cleanup:worktree`
- Remove temporary files, generated leftovers, and test artifacts that are not meant to ship.
- Do not discard unrelated user changes.

## Documentation Sync

- Update the docs touched by the change:
  - `CHANGELOG.md`
  - `TASKS.md`
  - `ROUTES.md`
  - `docs/business-logic.md`
  - `docs/frontend.md`
  - `docs/backend.md`
- If code and docs disagree, fix them in the same change.

## GitHub Update

- Stage only the relevant files.
- Use a commit message that states what changed and why.
- Prepare for push, but do not push or deploy unless the task explicitly includes it.

## Production Readiness

- Confirm required env vars are present for the target environment.
- Remove or disable dev-only flags and debug config.
- Confirm the build is production-safe.

## Deploy

- Prepare the deploy command or release steps.
- Do not run destructive or external deployment actions without explicit approval.

## Post-Deploy Check

- Verify these critical flows after deployment:
  - login and OTP
  - order creation
  - admin flows
  - shared modal behavior

## Reporting

- Summarize system status, issues found, fixes applied, docs updated, readiness, risks, and manual checks required.
- Update `TASKS.md` so completed work is moved to `Done` and genuine follow-ups are captured under `Next`.
