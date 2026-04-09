# Architecture

See also: [AGENTS.md](AGENTS.md), [ROUTES.md](ROUTES.md), [ERROR_HANDLING.md](ERROR_HANDLING.md), [docs/architecture-performance-rules.md](docs/architecture-performance-rules.md), [docs/backend.md](docs/backend.md), [docs/frontend.md](docs/frontend.md), [docs/database.md](docs/database.md)

## System Shape

- Frontend: React SPA bootstrapped by [src/main.jsx](src/main.jsx), composed in [src/App.jsx](src/App.jsx), and routed by [src/app/appRoutes.jsx](src/app/appRoutes.jsx).
- Backend: Express app assembled by [server/appFactory.js](server/appFactory.js), with core wiring in [server/appFactory/createCore.js](server/appFactory/createCore.js) and domain services in [server/appFactory/createDomainServices.js](server/appFactory/createDomainServices.js).
- Database: Postgres only. Schema changes flow through [supabase/migrations](supabase/migrations).

## Frontend Composition

- [src/App.jsx](src/App.jsx) only wires the top-level provider tree: router, route policy, session, cart, notifications, overlay host, window manager, and [src/RootShell.jsx](src/RootShell.jsx).
- Route policy is declared with the route definitions in [src/app/routeDefinitions.jsx](src/app/routeDefinitions.jsx) and resolved at runtime by [src/providers/RoutePolicyProvider.jsx](src/providers/RoutePolicyProvider.jsx).
- [src/RootShell.jsx](src/RootShell.jsx) is the only global chrome owner. It selects the active shell variant from the resolved route policy and gates route-level side effects such as analytics and notifications.
- Shell variants live in [src/shells/DefaultShell.jsx](src/shells/DefaultShell.jsx), [src/shells/AccountShell.jsx](src/shells/AccountShell.jsx), [src/shells/ImmersiveShell.jsx](src/shells/ImmersiveShell.jsx), and [src/shells/NoShell.jsx](src/shells/NoShell.jsx).
- Session, cart, and notifications now flow through [src/providers/SessionProvider.jsx](src/providers/SessionProvider.jsx), [src/providers/CartProvider.jsx](src/providers/CartProvider.jsx), and [src/providers/NotificationsProvider.jsx](src/providers/NotificationsProvider.jsx) instead of route-injected props.
- Shared overlay/Escape/inert ownership now flows through [src/providers/OverlayProvider.jsx](src/providers/OverlayProvider.jsx). Desktop windows, mobile sheets, popup guards, mobile menu, and account dropdowns register stack entries there.
- Feature pages are orchestrated by large controller hooks rather than page-local business logic:
  - [src/features/admin/hooks/useAdminPageController.js](src/features/admin/hooks/useAdminPageController.js)
  - [src/features/catalog/products/hooks/useProductsController.js](src/features/catalog/products/hooks/useProductsController.js)
  - [src/features/commerce/purchase/hooks/usePurchaseManagementController.js](src/features/commerce/purchase/hooks/usePurchaseManagementController.js)
  - [src/features/credits/history/hooks/useCreditHistoryController.jsx](src/features/credits/history/hooks/useCreditHistoryController.jsx)
  - [src/features/notifications/hooks/useNotificationsInbox.js](src/features/notifications/hooks/useNotificationsInbox.js)

## Backend Composition

- [server/index.js](server/index.js) only starts runtime. It does not manually wire routes.
- Route registration flows through:
  - [server/appFactory.js](server/appFactory.js)
  - [server/appFactory/registerFeatures/index.js](server/appFactory/registerFeatures/index.js)
  - [server/core/bootstrap/features.js](server/core/bootstrap/features.js)
  - `server/core/bootstrap/featureRegistrars/*.js`
  - `server/features/**/routes/**/*.js`
- The backend does not use a central controller layer. Practical controller ownership is split between route modules and same-feature helper trees.

## Data And Integrations

- HTTP bootstrap and base middleware live in [server/core/httpSetup.js](server/core/httpSetup.js).
- Auth, email, WhatsApp, and notification providers are constructed in [server/core/bootstrap/providers.js](server/core/bootstrap/providers.js).
- Query compatibility is handled by [server/db/queryAdapter.js](server/db/queryAdapter.js), which converts SQLite-style `?` placeholders to Postgres parameters as migration glue for legacy query shapes, not as a supported multi-database abstraction.
- Database access is Postgres-native and async-only. Synchronous database adapters are intentionally unsupported in [server/db/executionAdapter.js](server/db/executionAdapter.js).

## Cross-Cutting Coupling

- Purchase-order lifecycle and payment status rules are shared between [server/features/purchase/purchaseConstants.js](server/features/purchase/purchaseConstants.js) and [src/features/commerce/purchase/utils/orders.js](src/features/commerce/purchase/utils/orders.js).
- Offer pricing is server-authoritative in [server/features/offers/offerEngine.js](server/features/offers/offerEngine.js), then consumed by order placement in [server/features/sales/orderPlacement.js](server/features/sales/orderPlacement.js).
- Credit payment scoring and aging are shared between [server/features/credits/utils/creditBadges.js](server/features/credits/utils/creditBadges.js) and [server/features/credits/utils/paymentIntelligence.js](server/features/credits/utils/paymentIntelligence.js). Credit-history badges, WhatsApp credit messaging, and the admin aging report must stay aligned to that derived output.
- Response and error propagation are part of the backend contract: route modules should preserve explicit status codes and JSON error shapes through [server/core/routeErrors.js](server/core/routeErrors.js) and the rules in [ERROR_HANDLING.md](ERROR_HANDLING.md).
- Route changes must keep [ROUTES.md](ROUTES.md) and the frontend API wrappers aligned.
- Frontend API wrappers must not invent backend resources that are absent from [ROUTES.md](ROUTES.md); cart remains a frontend-only draft until checkout, but cart mutations are now centralized in [src/providers/CartProvider.jsx](src/providers/CartProvider.jsx).
