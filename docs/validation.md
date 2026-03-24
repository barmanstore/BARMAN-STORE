# Validation

See also: [business-logic.md](business-logic.md), [api-contract.md](api-contract.md), [../ERROR_HANDLING.md](../ERROR_HANDLING.md)

## Backend Validation Anchors

- Customer order readiness: [server/utils/customerValidation.js](../server/utils/customerValidation.js)
- Product payload rules: [server/utils/product/normalizers/productPayloadValidator.js](../server/utils/product/normalizers/productPayloadValidator.js)
- Purchase-order creation input: `server/features/commerce/routes/purchaseOrders/listCreate/validateInput.js`
- Credit issue admin correction dates and actions: [server/features/credits/routes/creditIssues/admin/resolveIssue.js](../server/features/credits/routes/creditIssues/admin/resolveIssue.js)

## Frontend Validation Anchors

- Product form validation: [src/features/catalog/products/utils/productFormValidation.js](../src/features/catalog/products/utils/productFormValidation.js)
- Shared email validation: [src/shared/utils/validation.js](../src/shared/utils/validation.js)
- Purchase UI error normalization: [src/features/commerce/purchase/utils/orders.js](../src/features/commerce/purchase/utils/orders.js)

## Rules

- Keep fast user feedback in the frontend, but enforce the real contract on the backend.
- Reuse existing validators and normalizers before creating new ones.
- If validation rules change, keep the message shape and status codes aligned with [../ERROR_HANDLING.md](../ERROR_HANDLING.md).
