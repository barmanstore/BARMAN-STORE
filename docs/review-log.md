# Review Log

Use one dated section per review pass.

This file records review-only findings, corrections, and follow-up guidance. Implemented changes still belong in [../CHANGELOG.md](../CHANGELOG.md), and active engineering follow-ups that need cross-session tracking still belong in [../TASKS.md](../TASKS.md).

## 2026-04-01

### Scope

- Review of [../barman_store_system_review.docx](../barman_store_system_review.docx) against the live purchase, restock, dashboard, credit, daily-sales, and WhatsApp flows.

### Confirmed Findings At Review Time

- The admin home dashboard still does not expose one operator-first "supplier visit prep" surface that combines tomorrow's scheduled distributor, payable balance, suggested short items, payment shortcut, PO draft, and WhatsApp send in one place. Current behavior is split across [../src/features/admin/sections/DashboardSection.jsx](../src/features/admin/sections/DashboardSection.jsx), [../src/features/commerce/purchase/components/sections/PurchaseDashboardSection.jsx](../src/features/commerce/purchase/components/sections/PurchaseDashboardSection.jsx), and [../src/features/admin/sections/RestockDashboardSection.jsx](../src/features/admin/sections/RestockDashboardSection.jsx).
- The purchase create flow already has an in-form review/save area in [../src/features/commerce/purchase/components/PurchaseEntryModals.jsx](../src/features/commerce/purchase/components/PurchaseEntryModals.jsx), but distributor WhatsApp sending still happens later from the orders list/detail flow in [../src/features/commerce/purchase/components/sections/PurchaseOrdersSection.jsx](../src/features/commerce/purchase/components/sections/PurchaseOrdersSection.jsx). The remaining gap is a tighter final-review-to-send handoff, not the absence of review UI.
- Daily sales totals in [../src/features/admin/sections/DailySalesSection.jsx](../src/features/admin/sections/DailySalesSection.jsx) are computed only from recorded bills through [../src/features/admin/hooks/useAdminComputedData.js](../src/features/admin/hooks/useAdminComputedData.js). There is still no owner-entered daily cash tally path for unrecorded walk-in cash sales.
- Review-time search did not find a live "new supplier product" alert or novelty marker. Distributor product knowledge and suggestions exist in [../server/services/purchaseOperations/summaryInsights/distributorInsights.js](../server/services/purchaseOperations/summaryInsights/distributorInsights.js), but there is no explicit UI flag for "new from this supplier and not yet in my catalog/order habit".
- Review-time search did not find a dedicated owner-mobile quick-actions/tasks surface for supplier visits, due payments, draft POs, and pending deliveries. The admin dashboard has generic sections, but not a focused small-screen owner task mode.
- Automatic WhatsApp delivery is still not operational. The purchase summary payload explicitly reports `whatsapp: "manual"` in [../server/services/purchaseOperations/summaryResponse/payload.js](../server/services/purchaseOperations/summaryResponse/payload.js), and [../server/whatsappProvider.js](../server/whatsappProvider.js) still throws `"WhatsApp provider integration is not implemented yet."` on send attempts.

### Corrections To Review Claims

- The claim that the restock flow has no supplier filter is stale. [../src/features/admin/sections/RestockDashboardSection.jsx](../src/features/admin/sections/RestockDashboardSection.jsx) already supports distributor filtering, distributor-aware row metadata, and a review-stage PO handoff with selected quantities.
- The claim that the system lacks tomorrow supplier prep from purchase planning is overstated. [../src/features/commerce/purchase/components/sections/dashboard/PurchasePlanningPanel.jsx](../src/features/commerce/purchase/components/sections/dashboard/PurchasePlanningPanel.jsx) already exposes `Today Order Day`, `Tomorrow PO Prep`, `Weekly Schedule`, and draft-PO shortcuts backed by scheduled distributor summary data.
- The claim that supplier payment recording lacks a quick entry path is only partially true. A pay shortcut already exists in [../src/features/commerce/purchase/components/sections/dashboard/PurchasePaymentsPanel.jsx](../src/features/commerce/purchase/components/sections/dashboard/PurchasePaymentsPanel.jsx) and `Add Payment` actions already exist in [../src/features/commerce/purchase/components/sections/PurchaseOrdersSection.jsx](../src/features/commerce/purchase/components/sections/PurchaseOrdersSection.jsx). The remaining gap is surfacing that action inside the same visit-prep card, not creating payment recording from scratch.
- The claim that customers cannot see their payment badge is stale. The customer route [../src/app/routeDefinitions.jsx](../src/app/routeDefinitions.jsx) mounts `/my-credit`, and the shared header in [../src/features/credits/history/components/CreditHistoryHeader.jsx](../src/features/credits/history/components/CreditHistoryHeader.jsx) already renders the customer-facing `paymentBadgeSummary`.

### Remaining Follow-Up Direction

1. Owner-mobile quick-actions/tasks view was later implemented on 2026-04-01.
2. Supplier novelty alerts in purchase planning were later implemented on 2026-04-01.
3. WhatsApp scope was later aligned on 2026-04-01 to stay explicit about manual launcher/prepared-message flow until a real provider-backed sender exists.

## 2026-03-29

### Scope

- Review of auth, offer preview, env loading, rate limiting, cache behavior, and repo hygiene claims raised during a security and architecture pass.

### Confirmed Findings At Review Time

- `POST /api/offers/preview` was public in [../server/features/commerce/routes/offersRoutes.js](../server/features/commerce/routes/offersRoutes.js) and trusted client-supplied `customer_user_id` while [../server/features/offers/offerEngine.js](../server/features/offers/offerEngine.js) queried `orders` to resolve first-order eligibility. That review finding was later fixed by binding public and customer-authenticated preview to session identity while allowing explicit customer context only for authenticated admin billing preview.
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

1. Keep `/api/offers/preview` public for cart and checkout flows, but stop trusting arbitrary client-supplied user ids on that route. This was later addressed by binding normal preview to session identity and limiting explicit customer selection to authenticated admin billing preview.
2. Replace security-sensitive numeric code generation with `crypto.randomInt(...)` based logic in [../server/features/auth/authSupport.js](../server/features/auth/authSupport.js).
3. Move remaining token and legacy SHA-256 comparisons onto constant-time comparison helpers.
4. Fix quoted-value parsing in [../server/loadEnv.js](../server/loadEnv.js) so comment stripping does not alter intended secret values.
5. Document the deployment boundary for the current in-memory limiter and plan a shared backing store if multi-instance enforcement becomes a requirement.

### Evidence-Backed Audit Addendum

- `/api/credit/aging` now reads from snapshot data but does not guard against empty/uninitialized snapshots, so it can return a valid-looking empty report. Add a runtime guard that logs or returns `{ status: "initializing" }` when snapshots are missing.
- Native dialogs are still used in non-UI logic, including `window.alert` and `window.confirm` in [../src/features/commerce/purchase/hooks/usePurchaseStatusHandlers.js](../src/features/commerce/purchase/hooks/usePurchaseStatusHandlers.js). Replace with UI-layer confirmation/notification patterns.
- Raw `err.message` strings are still surfaced directly to UI in purchase and profile flows; apply `formatApiError(err)` at call sites to standardize safe messages.
- Some network calls bypass `apiFetch`, which means 401 handling is inconsistent. Direct `fetch(...)` calls exist in [../src/features/admin/hooks/useAdminImportExport.js](../src/features/admin/hooks/useAdminImportExport.js) and [../src/features/admin/hooks/useAdminOrderActions.js](../src/features/admin/hooks/useAdminOrderActions.js).
