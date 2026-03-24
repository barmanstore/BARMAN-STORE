# Architecture

See also: [AGENTS.md](AGENTS.md), [ROUTES.md](ROUTES.md), [docs/backend.md](docs/backend.md), [docs/frontend.md](docs/frontend.md), [docs/database.md](docs/database.md)

## System Shape

- Frontend: React SPA bootstrapped by [src/main.jsx](src/main.jsx), composed in [src/App.jsx](src/App.jsx), and routed by [src/app/appRoutes.jsx](src/app/appRoutes.jsx).
- Backend: Express app assembled by [server/appFactory.js](server/appFactory.js), with core wiring in [server/appFactory/createCore.js](server/appFactory/createCore.js) and domain services in [server/appFactory/createDomainServices.js](server/appFactory/createDomainServices.js).
- Database: Postgres only. Schema changes flow through [supabase/migrations](supabase/migrations).

## Frontend Composition

- [src/App.jsx](src/App.jsx) owns shell-level concerns: session bootstrap, notifications, popup shortcuts, mobile menu state, and global escape behavior.
- [src/App.jsx](src/App.jsx) also keeps the cart badge synchronized from local storage; the cart is not backed by a backend resource.
- [src/shared/components/AppShell.jsx](src/shared/components/AppShell.jsx) provides the layout shell around routed pages.
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
  - `server/features/*/register*Feature.js`
  - `server/features/**/routes/**/*.js`
- The backend does not use a central controller layer. Practical controller ownership is split between route modules and same-feature helper trees.

## Data And Integrations

- HTTP bootstrap and base middleware live in [server/core/httpSetup.js](server/core/httpSetup.js).
- Auth, email, WhatsApp, and notification providers are constructed in [server/core/bootstrap/providers](server/core/bootstrap/providers).
- Query compatibility is handled by [server/db/queryAdapter.js](server/db/queryAdapter.js), which converts SQLite-style `?` placeholders to Postgres parameters.
- Synchronous database adapters are intentionally unsupported in [server/db/executionAdapter.js](server/db/executionAdapter.js).

## Cross-Cutting Coupling

- Purchase-order lifecycle and payment status rules are shared between [server/features/purchase/purchaseConstants.js](server/features/purchase/purchaseConstants.js) and [src/features/commerce/purchase/utils/orders.js](src/features/commerce/purchase/utils/orders.js).
- Offer pricing is server-authoritative in [server/features/offers/offerEngine.js](server/features/offers/offerEngine.js), then consumed by order placement in [server/features/sales/orderPlacement.js](server/features/sales/orderPlacement.js).
- Route changes must keep [ROUTES.md](ROUTES.md) and the frontend API wrappers aligned.
- Frontend API wrappers must not invent backend resources that are absent from [ROUTES.md](ROUTES.md); cart remains a frontend-only draft until checkout.
