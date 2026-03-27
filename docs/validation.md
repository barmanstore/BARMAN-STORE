# Validation

See also: [business-logic.md](business-logic.md), [api-contract.md](api-contract.md), [../ERROR_HANDLING.md](../ERROR_HANDLING.md)

## Backend Validation Anchors

- Customer order readiness: [server/utils/customerValidation.js](../server/utils/customerValidation.js)
- Product payload rules: [server/utils/product/normalizers/productPayloadValidator.js](../server/utils/product/normalizers/productPayloadValidator.js)
- Purchase-order creation input: `server/features/commerce/routes/purchaseOrders/listCreate/validateInput.js`
- Credit issue admin correction dates and actions: [server/features/credits/routes/creditIssues/admin/resolveIssue.js](../server/features/credits/routes/creditIssues/admin/resolveIssue.js)
- Admin customer credit-limit updates: [server/features/auth/routes/userCrud/userRoleActions.js](../server/features/auth/routes/userCrud/userRoleActions.js) and [server/features/auth/routes/userCrud/profile/profileValidation.js](../server/features/auth/routes/userCrud/profile/profileValidation.js)

## Frontend Validation Anchors

- Product form validation: [src/features/catalog/products/utils/productFormValidation.js](../src/features/catalog/products/utils/productFormValidation.js)
- Shared email validation: [src/shared/utils/validation.js](../src/shared/utils/validation.js)
- Purchase UI error normalization: [src/features/commerce/purchase/utils/orders.js](../src/features/commerce/purchase/utils/orders.js)
- Admin customer credit-limit form validation: [src/shared/components/UserEditModal.jsx](../src/shared/components/UserEditModal.jsx)

## Rules

- Keep fast user feedback in the frontend, but enforce the real contract on the backend.
- Reuse existing validators and normalizers before creating new ones.
- If validation rules change, keep the message shape and status codes aligned with [../ERROR_HANDLING.md](../ERROR_HANDLING.md).
- Customer `credit_limit` values must be numeric and greater than or equal to `0`. Only admin-managed user flows may set them; self-service profile updates must not accept them.
- Payment-period state is server-derived from `credit_history`. Do not add client-managed create/update flows for `customer_payment_periods` or score snapshots.
