# Bug Log

Central log for production/local bugs, fixes, verification, and preventive actions.

## How To Use

- Add new bugs at the top under `Open / Active Issues`.
- Use one entry per bug ID. Update the same entry as status changes.
- Keep details factual and reproducible.
- Do not close a bug without verification details.

## Status Definitions

- `Open`: reported, not yet triaged.
- `In Progress`: actively being investigated or fixed.
- `Fixed`: code/config fix applied and linked.
- `Verified`: fix validated in target environment.
- `Closed`: fully completed with preventive action captured.

## Severity Definitions

- `P0`: critical outage/data loss/security impact.
- `P1`: major feature broken, no acceptable workaround.
- `P2`: partial degradation, workaround exists.
- `P3`: minor issue, cosmetic, low impact.

## Entry Template

```md
## [BUG-YYYYMMDD-###] [Area] Short title
- Date reported:
- Reported by:
- Environment: (prod/staging/local, browser/device)
- Severity: (P0/P1/P2/P3)
- Status: (Open/In Progress/Fixed/Verified/Closed)
- Owner:
- Symptoms:
- Steps to reproduce:
  1.
  2.
  3.
- Expected result:
- Actual result:
- Root cause:
- Fix summary:
- Files changed:
  - `path/to/file`
- PR/commit:
- Verification steps:
  1.
  2.
  3.
- Verified by:
- Date verified:
- Preventive action:
- Follow-up tasks:
  1.
  2.
- Linked bugs:
```

## Process Rules

- ID format must be `BUG-YYYYMMDD-###` (example: `BUG-20260222-001`).
- Prefix title with area tags like `[API]`, `[UI]`, `[Auth]`, `[CORS]`, `[DB]`.
- Every status update must include date and updater note in the same entry.
- `Fixed` must include commit hash or PR.
- `Closed` requires root cause, verification, and preventive action.
- If issue repeats, create a new bug and link previous IDs in `Linked bugs`.

## Open / Active Issues

## [BUG-20260222-001] [CORS] GitHub Pages API calls blocked at ngrok preflight
- Date reported: 2026-02-22
- Reported by: User
- Environment: prod (`https://narenbarman.github.io/BARMAN_STORE_REACT/`)
- Severity: P1
- Status: Fixed
- Owner: Codex + User
- Symptoms: Browser blocked `/api/products` and `/api/categories` with CORS preflight error.
- Steps to reproduce:
  1. Open products page on GitHub Pages.
  2. Observe requests to ngrok API.
  3. See CORS failure in console.
- Expected result: API responses include valid CORS headers for GitHub Pages origin.
- Actual result: Preflight failed; browser blocked requests.
- Root cause: ngrok endpoint/tunnel mismatch and preflight handling inconsistencies while frontend was pointing to ngrok API.
- Fix summary:
  - Updated server CORS handling for explicit allowed origins and OPTIONS.
  - Removed unnecessary custom ngrok request header from browser API calls.
  - Rebuilt and redeployed frontend.
  - Revalidated OPTIONS/GET against ngrok endpoint.
- Files changed:
  - `server/index.js`
  - `src/services/api.js`
  - `scripts/run-ngrok.js`
  - `run-ngrok.bat`
- PR/commit: (fill when committed)
- Verification steps:
  1. OPTIONS to `/api/products` returns CORS headers for `https://narenbarman.github.io`.
  2. GET `/api/products` returns `200`.
  3. Products page loads without console CORS errors after hard refresh.
- Verified by: (fill)
- Date verified: (fill)
- Preventive action:
  - Keep ngrok tunnel target documented and monitored.
  - Avoid non-simple custom headers unless required.
- Follow-up tasks:
  1. Add startup script/check to validate ngrok endpoint health.
  2. Add release checklist item for CORS preflight verification.
- Linked bugs:

## Closed Issues

<!-- Move entries here only after status = Closed -->

