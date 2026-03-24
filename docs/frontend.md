# Frontend

See also: [../ARCHITECTURE.md](../ARCHITECTURE.md), [services.md](services.md), [ui-ux.md](ui-ux.md), [patterns.md](patterns.md)

## Real Structure

- Bootstrapping runs through [src/main.jsx](../src/main.jsx).
- Global app composition lives in [src/App.jsx](../src/App.jsx).
- Page routing lives in [src/app/appRoutes.jsx](../src/app/appRoutes.jsx).
- Layout shell lives in [src/shared/components/AppShell.jsx](../src/shared/components/AppShell.jsx).
- Shared API access lives in `src/shared/services/api/*.js`, rooted at [src/shared/services/api/core.js](../src/shared/services/api/core.js).
- Cart state is local-storage backed in [src/App.jsx](../src/App.jsx) and feature cart pages, not by a backend cart API.

## State And Orchestration Pattern

- Large pages are controlled by feature hooks, not page components full of side effects.
- Key examples:
  - [src/features/admin/hooks/useAdminPageController.js](../src/features/admin/hooks/useAdminPageController.js)
  - [src/features/catalog/products/hooks/useProductsController.js](../src/features/catalog/products/hooks/useProductsController.js)
  - [src/features/commerce/purchase/hooks/usePurchaseManagementController.js](../src/features/commerce/purchase/hooks/usePurchaseManagementController.js)
  - [src/features/credits/history/hooks/useCreditHistoryController.jsx](../src/features/credits/history/hooks/useCreditHistoryController.jsx)
  - [src/features/notifications/hooks/useNotificationsInbox.js](../src/features/notifications/hooks/useNotificationsInbox.js)

## Change Rules

- Keep feature state inside the owning feature tree.
- Reuse existing controller-hook and builder-helper patterns before adding new top-level state.
- If a frontend API wrapper changes, verify it still matches [../ROUTES.md](../ROUTES.md).
- Do not add wrappers for endpoints that do not exist in [../ROUTES.md](../ROUTES.md). Cart remains local-only unless backend routes are added and documented first.
