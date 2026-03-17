# Frontend Modularization Plan

## Goals
- Move to feature-based structure with reusable shared modules.
- Keep entry points lean and focused on composition.
- Enable incremental migration with minimal regressions.

## Target Structure
- `src/app/`
  - `App.jsx`
  - `AppProviders.jsx`
  - `appRoutes.jsx`
  - `bootstrap/`
- `src/features/`
  - `auth/`
  - `commerce/`
  - `catalog/`
  - `sales/`
  - `credits/`
  - `notifications/`
  - `admin/`
- `src/shared/`
  - `components/`
  - `hooks/`
  - `utils/`
  - `services/`
  - `styles/`

## Phases (1 by 1)
1. **Bootstrap extraction**
   - Move host redirect, stale chunk recovery, cache cleanup out of `src/main.jsx`.
   - Create `src/app/bootstrap/*` and keep `main.jsx` minimal.

2. **App shell split**
   - Extract notification panel + message-to-customer logic from `src/App.jsx`.
   - New feature module: `src/features/notifications`.

3. **Route consolidation**
   - Create `src/app/appRoutes.jsx` with route definitions.
   - Keep `App.jsx` as shell + router.

4. **Largest pages migration**
   - `PurchaseManagement.jsx` -> `src/features/commerce/purchase`
   - `Products.jsx` -> `src/features/catalog/products`
   - `Admin.jsx` -> `src/features/admin`
   - `CreditHistory.jsx` -> `src/features/credits/history`

5. **Purchase management utilities**
   - Extract UOM + item helpers into `src/features/commerce/purchase/utils`.
   - Extract order status + form defaults into feature utils.

6. **Purchase management UI split**
   - Move `PurchaseWorkspaceSections` + `PurchaseEntryModals` into feature-local components.
   - Extract remaining modals inside `PurchaseManagement.jsx`.
   - Keep `PurchaseManagement.jsx` as orchestration only.

7. **API surface split**
   - Split `src/services/api.js` into `src/services/api/*` modules.
   - Keep a thin `src/services/api.js` barrel to preserve imports.
   - Later: promote feature-specific API modules into `src/features/*/api` when ready.

8. **Catalog modals**
   - Move `ProductForm` into `src/features/catalog/products`.
   - Move `CategoryManagement` into `src/features/catalog/categories`.

9. **Sales billing tab**
   - Move `BillingTab` into `src/features/sales/billing`.

10. **Shared user modal**
   - Move `UserEditModal` into `src/shared/components`.

11. **Auth pages**
   - Move `login` + `Profile` into `src/features/auth`.

12. **Cart & checkout**
   - Move `Cart` into `src/features/cart`.
   - Move `Checkout` into `src/features/checkout`.

13. **Order pages**
   - Move `OrderHistory`, `OrderDetails`, `OrderTracking` into `src/features/orders`.

14. **Admin feature pages**
   - Move distributor, inventory, insights, credits, billing, marketing, and customer request admin pages into `src/features/*`.

15. **Storefront + bills**
   - Move `Home`, `StoreInfo`, `StorePage`, `ProductRecommendations` into `src/features/storefront`.
   - Move `MyBills` into `src/features/sales/billing`.

16. **Pages cleanup**
   - Keep only `src/shared/info.js` as shared copy.

17. **Catalog products helpers**
   - Move Products helpers into `src/features/catalog/products/utils`.
   - Extract brand + image helpers into `src/features/catalog/products/components`.

## Progress Checklist
- [x] Phase 1: Bootstrap extraction
- [x] Phase 2: App shell split
- [x] Phase 3: Route consolidation
- [x] Phase 4: Largest pages migration
- [x] Phase 5: Purchase management utilities
- [x] Phase 6: Purchase management UI split
- [x] Phase 7: API surface split
- [x] Phase 8: Catalog modals
- [x] Phase 9: Sales billing tab
- [x] Phase 10: Shared user modal
- [x] Phase 11: Auth pages
- [x] Phase 12: Cart & checkout
- [x] Phase 13: Order pages
- [x] Phase 14: Admin feature pages
- [x] Phase 15: Storefront + bills
- [x] Phase 16: Pages cleanup
- [x] Phase 17: Catalog products helpers

## Mapping Notes (initial)
- `src/services/api` will be split into `src/features/*/api` as migration progresses.
- Cross-feature utilities will move to `src/shared/utils`.
- Common UI moves to `src/shared/components`.
