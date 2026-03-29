# Frontend

See also: [../ARCHITECTURE.md](../ARCHITECTURE.md), [services.md](services.md), [ui-ux.md](ui-ux.md), [patterns.md](patterns.md)

## Real Structure

- Bootstrapping runs through [src/main.jsx](../src/main.jsx).
- Global app composition in [src/App.jsx](../src/App.jsx) is provider-only: router, route policy, session, cart, notifications, overlay host, window manager, and [src/RootShell.jsx](../src/RootShell.jsx).
- Route declarations and route policy live together in [src/app/routeDefinitions.jsx](../src/app/routeDefinitions.jsx), and [src/app/appRoutes.jsx](../src/app/appRoutes.jsx) mounts those route components without prop injection.
- Global chrome is owned only by [src/RootShell.jsx](../src/RootShell.jsx) plus the shell renderers in `src/shells/*.jsx`.
- Shared API access lives in `src/shared/services/api/*.js`, rooted at [src/shared/services/api/core.js](../src/shared/services/api/core.js).
- Cart state is local-storage backed through [src/providers/CartProvider.jsx](../src/providers/CartProvider.jsx), not by a backend cart API.

## State And Orchestration Pattern

- Large pages are controlled by feature hooks, not page components full of side effects.
- Shared app state that crosses routes now lives in dedicated providers instead of route props:
  - [src/providers/SessionProvider.jsx](../src/providers/SessionProvider.jsx)
  - [src/providers/CartProvider.jsx](../src/providers/CartProvider.jsx)
  - [src/providers/NotificationsProvider.jsx](../src/providers/NotificationsProvider.jsx)
  - [src/providers/RoutePolicyProvider.jsx](../src/providers/RoutePolicyProvider.jsx)
  - [src/providers/OverlayProvider.jsx](../src/providers/OverlayProvider.jsx)
- Admin user-management flow details live in [user-management-state-contract.md](user-management-state-contract.md).
- Key examples:
  - [src/features/admin/hooks/useAdminPageController.js](../src/features/admin/hooks/useAdminPageController.js)
  - [src/features/catalog/products/hooks/useProductsController.js](../src/features/catalog/products/hooks/useProductsController.js)
  - [src/features/commerce/purchase/hooks/usePurchaseManagementController.js](../src/features/commerce/purchase/hooks/usePurchaseManagementController.js)
  - [src/features/credits/history/hooks/useCreditHistoryController.jsx](../src/features/credits/history/hooks/useCreditHistoryController.jsx)
  - [src/features/notifications/hooks/useNotificationsInbox.js](../src/features/notifications/hooks/useNotificationsInbox.js)

## Change Rules

- Keep feature state inside the owning feature tree.
- Reuse existing controller-hook and builder-helper patterns before adding new top-level state.
- Do not reintroduce route prop injection for shell-owned data. Session, cart, notifications, route policy, and overlay ownership already have provider boundaries.
- Do not let pages or feature layouts decide header/footer visibility. Route policy chooses the shell variant and the shell owns chrome.
- If shell/runtime ownership changes, run `npm run check:shell-runtime` and `npm run test:shell-runtime` before sign-off.
- If a frontend API wrapper changes, verify it still matches [../ROUTES.md](../ROUTES.md).
- Do not add wrappers for endpoints that do not exist in [../ROUTES.md](../ROUTES.md). Cart remains local-only unless backend routes are added and documented first.
- Keep admin user search backend-owned. The current `/api/users` contract is simple server-side `LIKE` search; if scalability changes are needed, extend the backend search implementation without changing the frontend query model first.
- Keep the customer credit-history monthly statement view presentation-only. It may summarize the ledger by month for readability, but it must continue to consume `credit_history` and `paymentBadgeSummary` rather than inventing a parallel statement source of truth.
