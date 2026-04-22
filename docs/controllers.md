# Controllers

See also: [backend.md](backend.md), [frontend.md](frontend.md), [services.md](services.md), [patterns.md](patterns.md)

## What "Controller" Means Here

- Frontend: controller hooks orchestrate page state, side effects, and service calls.
- Backend: route handlers and same-feature helper trees act as the controller layer.

## Frontend Controller Examples

- [src/features/admin/hooks/useAdminPageController.js](../src/features/admin/hooks/useAdminPageController.js)
- [src/features/catalog/products/hooks/useProductsController.js](../src/features/catalog/products/hooks/useProductsController.js)
- [src/features/commerce/purchase/hooks/usePurchaseManagementController.js](../src/features/commerce/purchase/hooks/usePurchaseManagementController.js)
- [src/features/credits/history/hooks/useCreditHistoryController.jsx](../src/features/credits/history/hooks/useCreditHistoryController.jsx)

## Backend Controller Examples

- Inline route handlers in [server/features/auth/routes/userCrud/userProfileUpdates.js](../server/features/auth/routes/userCrud/userProfileUpdates.js)
- Helper-driven route flows in:
  - [server/features/commerce/routes/purchaseOrders/purchaseOrdersListCreate.js](../server/features/commerce/routes/purchaseOrders/purchaseOrdersListCreate.js)
  - [server/features/credits/routes/creditIssues/creditIssuesAdmin.js](../server/features/credits/routes/creditIssues/creditIssuesAdmin.js)
  - [server/features/communication/routes/messageToCustomerRoutes.js](../server/features/communication/routes/messageToCustomerRoutes.js)

## Rules

- Do not add a generic backend `controllers` directory just to mirror other projects.
- If backend route logic becomes large, split it into adjacent helper files first.
- If frontend page logic becomes large, split it across feature hooks and utilities before adding more top-level app state.
