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
