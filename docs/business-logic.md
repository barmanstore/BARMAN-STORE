# Business Logic

See also: [../ROUTES.md](../ROUTES.md), [validation.md](validation.md), [api-contract.md](api-contract.md)

## Auth

- OTP and verification flows are the active auth model:
  - [server/features/auth/routes/otp/otpRequestRoutes.js](../server/features/auth/routes/otp/otpRequestRoutes.js)
  - [server/features/auth/routes/otp/otpVerifyRoutes.js](../server/features/auth/routes/otp/otpVerifyRoutes.js)
- Password-auth routes are compatibility stubs and intentionally return `410` from [server/features/auth/routes/otp/passwordDisabledRoutes.js](../server/features/auth/routes/otp/passwordDisabledRoutes.js). Do not revive them accidentally.

## Orders

- Supported order creation is `POST /api/orders/create-validated`, not the legacy `POST /api/orders`.
- The shopping cart is a frontend draft, not a backend resource. Checkout and order validation begin only at the documented order endpoints; there is no live `/api/cart` backend API.
- Customer profile completeness is enforced before order placement by [server/utils/customerValidation.js](../server/utils/customerValidation.js) and [server/features/sales/routes/orderCreateRoutes.js](../server/features/sales/routes/orderCreateRoutes.js).
- Core placement logic lives in [server/features/sales/orderPlacement.js](../server/features/sales/orderPlacement.js).

## Purchase Operations

- Purchase-order lifecycle constants live in [server/features/purchase/purchaseConstants.js](../server/features/purchase/purchaseConstants.js).
- Frontend purchase screens normalize the same lifecycle states in [src/features/commerce/purchase/utils/orders.js](../src/features/commerce/purchase/utils/orders.js).
- Do not change one side without the other.

## Offers

- Offer eligibility and pricing are server-side in [server/features/offers/offerEngine.js](../server/features/offers/offerEngine.js).
- Order placement consumes those rules in [server/features/sales/orderPlacement.js](../server/features/sales/orderPlacement.js). Frontend offer badges are presentation only.

## Credit

- Credit issue resolution in [server/features/credits/routes/creditIssues/admin/resolveIssue.js](../server/features/credits/routes/creditIssues/admin/resolveIssue.js) can create correction ledger entries and trigger balance recalculation.
- Treat admin issue resolution as a financial workflow, not a UI-only status toggle.
- Credit payment score and aging output now come from the shared payment-intelligence scoring in [server/features/credits/utils/creditBadges.js](../server/features/credits/utils/creditBadges.js), backed by derived period rebuilds in [server/features/credits/utils/paymentIntelligence.js](../server/features/credits/utils/paymentIntelligence.js). Credit-history badges, WhatsApp credit messaging, and the admin aging report must stay aligned to that shared scoring output.
- Payment periods are derived from `credit_history` and rebuilt with deterministic FIFO ordering. `customer_payment_periods` is derived operational state and must not be manually edited.
- Every credit ledger entry must store a `due_date` value. For manual credits, if not provided, it is computed once as `transaction_date + credit_terms_days` and stored on the entry (never recomputed later).
- FIFO ordering is absolute: `transaction_ts ASC, created_at ASC, id ASC`. `transaction_ts` is required for all entries; no COALESCE fallbacks.
- Overpayments are allowed and excess amounts are tracked as `unapplied_credit` in the payment-intelligence snapshot, but they must not improve scoring or reduce missed/late metrics.
- Credit-impacting mutations now rebuild both running balances and payment-intelligence state. The internal rollover route [server/features/credits/routes/creditLedger/creditPaymentIntelligenceJob.js](../server/features/credits/routes/creditLedger/creditPaymentIntelligenceJob.js) exists for daily overdue/score refresh runs.
- Manual customer credit limits are admin-managed through [server/features/auth/routes/userCrud/userRoleActions.js](../server/features/auth/routes/userCrud/userRoleActions.js) and [server/features/auth/routes/userCrud/profile/profileUpdateFlow.js](../server/features/auth/routes/userCrud/profile/profileUpdateFlow.js). A `credit_limit` of `0` means no enforced limit.
- Customers with fewer than two evaluated periods are treated as `New` (`customer_tag = insufficient_history`) and should not be presented as ordinary `Good` payers, even though a fallback score of `50` exists for internal normalization.
- Severe non-payment is surfaced with `is_defaulter` and `payment_status_tag = Defaulter` while keeping the primary badge as `Problem`.
