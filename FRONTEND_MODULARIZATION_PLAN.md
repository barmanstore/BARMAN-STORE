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
   - Split purchase modals + sections into feature-local components.
   - Keep `PurchaseManagement.jsx` as orchestration only.

7. **API surface split**
   - Split `src/services/api.js` into `src/features/*/api` modules.
   - Keep a thin `src/shared/services/apiClient`.

## Progress Checklist
- [x] Phase 1: Bootstrap extraction
- [x] Phase 2: App shell split
- [x] Phase 3: Route consolidation
- [x] Phase 4: Largest pages migration
- [x] Phase 5: Purchase management utilities
- [ ] Phase 6: Purchase management UI split
- [ ] Phase 7: API surface split

## Mapping Notes (initial)
- `src/services/api` will be split into `src/features/*/api` as migration progresses.
- Cross-feature utilities will move to `src/shared/utils`.
- Common UI moves to `src/shared/components`.
