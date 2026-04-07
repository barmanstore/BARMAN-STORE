# Patterns

See also: [controllers.md](controllers.md), [services.md](services.md), [naming-conventions.md](naming-conventions.md)

## Current Good Patterns

- Feature-first organization on both frontend and backend.
- Page orchestration through controller hooks plus smaller helper hooks:
  - [src/features/admin/hooks/useAdminPageController.js](../src/features/admin/hooks/useAdminPageController.js)
  - [src/features/catalog/products/hooks/useProductsController.js](../src/features/catalog/products/hooks/useProductsController.js)
  - [src/features/commerce/purchase/hooks/usePurchaseManagementController.js](../src/features/commerce/purchase/hooks/usePurchaseManagementController.js)
- Backend route composition through feature-local helper trees instead of giant single files:
  - `server/features/commerce/routes/purchaseOrders/listCreate/*`
  - `server/features/communication/routes/messageToCustomer/*`
- Normalization helpers for shared domain state, such as purchase-order status mapping in [src/features/commerce/purchase/utils/orders.js](../src/features/commerce/purchase/utils/orders.js).
- Request idempotency support through client request IDs.

## What To Repeat

- Add behavior inside an existing feature before creating a new top-level module.
- Keep data normalization near the domain that needs it.
- Prefer small helper extraction over broad architectural rewrites.
- Shared controlled UI primitives that can travel across features should live under `src/shared/components/*`, such as the filter inputs in [src/shared/components/filters/SearchFilter.jsx](../src/shared/components/filters/SearchFilter.jsx), [src/shared/components/filters/DropdownFilter.jsx](../src/shared/components/filters/DropdownFilter.jsx), and [src/shared/components/filters/DateRangeFilter.jsx](../src/shared/components/filters/DateRangeFilter.jsx). When a shared filter needs to support both quick chip rows and longer Amazon-style checklist panels, extend the shared primitive with a bounded variant prop instead of forking a purchase-only filter component.
- When a shared component family owns its shell and tone system, keep that styling in the shared folder instead of leaving duplicate feature-specific CSS behind.
