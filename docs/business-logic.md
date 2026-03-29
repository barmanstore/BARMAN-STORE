# Business Logic

See also: [../ROUTES.md](../ROUTES.md), [validation.md](validation.md), [api-contract.md](api-contract.md)

## Auth

- OTP and verification flows are the active auth model:
  - [server/features/auth/routes/otp/otpRequestRoutes.js](../server/features/auth/routes/otp/otpRequestRoutes.js)
  - [server/features/auth/routes/otp/otpVerifyRoutes.js](../server/features/auth/routes/otp/otpVerifyRoutes.js)
- Password-auth routes are compatibility stubs and intentionally return `410` from [server/features/auth/routes/otp/passwordDisabledRoutes.js](../server/features/auth/routes/otp/passwordDisabledRoutes.js). They return JSON telling callers to use OTP or OAuth login, so clients should treat them as permanently disabled compatibility surfaces, not a fallback path to revive.

## User Management

- Admin user-management state rules are documented in [user-management-state-contract.md](user-management-state-contract.md).
- Manual customer credit limits are admin-managed through [server/features/auth/routes/userCrud/userRoleActions.js](../server/features/auth/routes/userCrud/userRoleActions.js) and [server/features/auth/routes/userCrud/profile/profileUpdateFlow.js](../server/features/auth/routes/userCrud/profile/profileUpdateFlow.js). A `credit_limit` of `0` means no enforced limit, so blank admin input must be treated as unrestricted credit.
- Pending phone updates are reviewed through the dedicated admin phone-change queue in [server/features/auth/routes/phoneChangeAdmin/listRoutes.js](../server/features/auth/routes/phoneChangeAdmin/listRoutes.js); they are not part of the base `/api/users` list payload today.

## Orders

- Supported order creation is `POST /api/orders/create-validated`, not the legacy `POST /api/orders`.
- Legacy `POST /api/orders` remains mounted only as a `410` compatibility stub in [server/features/sales/routes/orderCreateRoutes.js](../server/features/sales/routes/orderCreateRoutes.js). Older clients must migrate to `POST /api/orders/create-validated`.
- The shopping cart is a frontend draft, not a backend resource. This is the current architecture boundary, not a missing `/api/cart` implementation. Checkout and order validation begin only at the documented order endpoints; there is no live `/api/cart` backend API.
- Customer profile completeness is enforced before order placement by [server/utils/customerValidation.js](../server/utils/customerValidation.js) and [server/features/sales/routes/orderCreateRoutes.js](../server/features/sales/routes/orderCreateRoutes.js).
- Core placement logic lives in [server/features/sales/orderPlacement.js](../server/features/sales/orderPlacement.js).

## Purchase Operations

- Purchase-order lifecycle constants live in [server/features/purchase/purchaseConstants.js](../server/features/purchase/purchaseConstants.js).
- Frontend purchase screens normalize the same lifecycle states in [src/features/commerce/purchase/utils/orders.js](../src/features/commerce/purchase/utils/orders.js).
- The current repo guardrail is lifecycle smoke coverage in [scripts/test-po-lifecycle-flow.mjs](../scripts/test-po-lifecycle-flow.mjs) via `npm run test:po-lifecycle`, but there is no dedicated parity check between these two files. Do not change one side without the other.

## Offers

- Offer eligibility and pricing are server-side in [server/features/offers/offerEngine.js](../server/features/offers/offerEngine.js).
- Active offers are loaded through [server/features/offers/offerEngine.js](../server/features/offers/offerEngine.js) with a short-lived active-offer cache. Admin offer create, update, and delete flows in [server/features/commerce/routes/offersRoutes.js](../server/features/commerce/routes/offersRoutes.js) invalidate that cache.
- Cart and checkout previews use the shared preview path in [src/shared/hooks/useOfferPricingPreview.js](../src/shared/hooks/useOfferPricingPreview.js), but final pricing is recomputed server-side during [server/features/sales/orderPlacement.js](../server/features/sales/orderPlacement.js) and [server/features/sales/routes/billingCreate/build/buildBillItems.js](../server/features/sales/routes/billingCreate/build/buildBillItems.js). Frontend offer badges are presentation only, and previewed discounts can change if active offers or server-side eligibility context changes before placement or billing.

## Credit

- Credit issue resolution in [server/features/credits/routes/creditIssues/admin/resolveIssue.js](../server/features/credits/routes/creditIssues/admin/resolveIssue.js) can create correction ledger entries and trigger balance recalculation.
- Treat admin issue resolution as a financial workflow, not a UI-only status toggle.
- Credit payment score and aging output now come from the shared payment-intelligence scoring in [server/features/credits/utils/creditBadges.js](../server/features/credits/utils/creditBadges.js), backed by derived period rebuilds in [server/features/credits/utils/paymentIntelligence.js](../server/features/credits/utils/paymentIntelligence.js). Credit-history badges, WhatsApp credit messaging, and the admin aging report must stay aligned to that shared scoring output.
- Critical ledger invariant: every credit ledger entry must store a `due_date` value. For manual credits, if not provided, it is computed once as `transaction_date + credit_terms_days` and stored on the entry; it must not be recomputed later during rebuilds or display flows.
- Payment periods are derived from `credit_history` and rebuilt with deterministic FIFO ordering. `customer_payment_periods` is derived operational state and must not be manually edited.
- FIFO ordering is absolute: `transaction_ts ASC, created_at ASC, id ASC`. `transaction_ts` is required for all entries; no COALESCE fallbacks.
- Overpayments are allowed and excess amounts are tracked as `unapplied_credit` in the payment-intelligence snapshot, but they must not improve scoring or reduce missed/late metrics.
- The canonical customer-facing “maintain score by” deadline is the earliest unpaid period `due_date` from the shared payment-intelligence summary. It can shift after partial payments and must be reused across UI, WhatsApp, and reports instead of being recomputed differently per surface.
- Credit-impacting admin mutations in [server/features/credits/routes/creditLedger/adjustments/createRoutes.js](../server/features/credits/routes/creditLedger/adjustments/createRoutes.js), [server/features/credits/routes/creditLedger/adjustments/updateRoutes.js](../server/features/credits/routes/creditLedger/adjustments/updateRoutes.js), [server/features/credits/routes/creditLedger/adjustments/deleteRoutes.js](../server/features/credits/routes/creditLedger/adjustments/deleteRoutes.js), and [server/features/credits/routes/creditIssues/admin/resolveIssue.js](../server/features/credits/routes/creditIssues/admin/resolveIssue.js) rebuild both running balances and payment-intelligence state. The internal rollover route [server/features/credits/routes/creditLedger/creditPaymentIntelligenceJob.js](../server/features/credits/routes/creditLedger/creditPaymentIntelligenceJob.js) exists for overdue and score refresh runs only; it does not replace mutation-time balance recalculation.
- Customers with fewer than two evaluated periods are treated as `New` (`customer_tag = insufficient_history`). Do not expose the fallback score of `50` as if it were an ordinary customer score in UI, WhatsApp, or reports.
- Severe non-payment is surfaced with `is_defaulter` and `payment_status_tag = Defaulter` while keeping the primary badge as `Problem`.
- The customer credit-history page may show a monthly statement / bill-style summary for clarity, but that view is derived presentation only. `credit_history`, FIFO settlement, aging, and the shared payment-intelligence output remain the source of truth.
