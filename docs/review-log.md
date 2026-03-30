# Review Log

Use one dated section per review pass.

This file records review-only findings, corrections, and follow-up guidance. Implemented changes still belong in [../CHANGELOG.md](../CHANGELOG.md), and active engineering follow-ups that need cross-session tracking still belong in [../TASKS.md](../TASKS.md).

## 2026-03-29

### Scope

- Review of auth, offer preview, env loading, rate limiting, cache behavior, and repo hygiene claims raised during a security and architecture pass.

### Confirmed Findings

- `POST /api/offers/preview` is public in [../server/features/commerce/routes/offersRoutes.js](../server/features/commerce/routes/offersRoutes.js) and trusts client-supplied `customer_user_id` while [../server/features/offers/offerEngine.js](../server/features/offers/offerEngine.js) queries `orders` to resolve first-order eligibility. That is an access-control and privacy gap on the preview path.
- Local OTP and phone-verification code generation in [../server/features/auth/authSupport.js](../server/features/auth/authSupport.js) still uses `Math.random()` for security-sensitive codes.
- Several hashed-secret comparisons still use plain string equality instead of constant-time comparison paths:
  - [../server/features/auth/authSupport.js](../server/features/auth/authSupport.js)
  - [../server/features/auth/routes/emailVerification/confirmRoutes.js](../server/features/auth/routes/emailVerification/confirmRoutes.js)
  - [../server/features/auth/routes/phoneVerificationRoutes.js](../server/features/auth/routes/phoneVerificationRoutes.js)
- [../server/loadEnv.js](../server/loadEnv.js) strips inline ` #` comments before unquoting values, so quoted secrets containing that pattern can be truncated during startup.
- The in-memory limiter in [../server/core/rateLimiter.js](../server/core/rateLimiter.js) is process-local only. That is acceptable for single-instance runtime and local development, but it does not provide shared enforcement across multiple instances.

### Corrections To Earlier Claims

- The plaintext fallback inside `verifyPassword()` in [../server/features/auth/authSupport.js](../server/features/auth/authSupport.js) is legacy risk, but it is not part of a live password-login flow in the current architecture. Password-auth endpoints are intentionally disabled in [../server/features/auth/routes/otp/passwordDisabledRoutes.js](../server/features/auth/routes/otp/passwordDisabledRoutes.js), and the only current runtime caller is OTP verification in [../server/features/auth/routes/otp/otpVerifyRoutes.js](../server/features/auth/routes/otp/otpVerifyRoutes.js).
- Offer cache invalidation on create, update, and delete already exists in [../server/features/commerce/routes/offersRoutes.js](../server/features/commerce/routes/offersRoutes.js) through `invalidateActiveOfferCache()`. The remaining limitation is cache scope across instances, not missing local invalidation.
- The bulk rebuild in [../server/features/credits/utils/paymentIntelligence.js](../server/features/credits/utils/paymentIntelligence.js) currently runs sequentially, so the proposed concurrency limiter is not needed unless that implementation is changed to parallel work later.
- Repo hygiene recommendations about adding `.gitignore` and `.gitattributes` were stale for this checkout. Both files already exist at [../.gitignore](../.gitignore) and [../.gitattributes](../.gitattributes).
- Review-time checks did not confirm tracked `.db` files or `server/uploads/` artifacts in the current index or reachable history snapshot inspected during this pass.

### Follow-Up Direction

1. Keep `/api/offers/preview` public for cart and checkout flows, but stop trusting arbitrary client-supplied user ids on that route. If eligibility depends on user identity, bind it to authenticated session state only.
2. Replace security-sensitive numeric code generation with `crypto.randomInt(...)` based logic in [../server/features/auth/authSupport.js](../server/features/auth/authSupport.js).
3. Move remaining token and legacy SHA-256 comparisons onto constant-time comparison helpers.
4. Fix quoted-value parsing in [../server/loadEnv.js](../server/loadEnv.js) so comment stripping does not alter intended secret values.
5. Document the deployment boundary for the current in-memory limiter and plan a shared backing store if multi-instance enforcement becomes a requirement.

### Evidence-Backed Audit Addendum

- `/api/credit/aging` now reads from snapshot data but does not guard against empty/uninitialized snapshots, so it can return a valid-looking empty report. Add a runtime guard that logs or returns `{ status: "initializing" }` when snapshots are missing.
- Native dialogs are still used in non-UI logic, including `window.alert` and `window.confirm` in [../src/features/commerce/purchase/hooks/usePurchaseStatusHandlers.js](../src/features/commerce/purchase/hooks/usePurchaseStatusHandlers.js). Replace with UI-layer confirmation/notification patterns.
- Raw `err.message` strings are still surfaced directly to UI in purchase and profile flows; apply `formatApiError(err)` at call sites to standardize safe messages.
- Some network calls bypass `apiFetch`, which means 401 handling is inconsistent. Direct `fetch(...)` calls exist in [../src/features/admin/hooks/useAdminImportExport.js](../src/features/admin/hooks/useAdminImportExport.js) and [../src/features/admin/hooks/useAdminOrderActions.js](../src/features/admin/hooks/useAdminOrderActions.js).
