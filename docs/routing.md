# Routing

See also: [../ROUTES.md](../ROUTES.md), [backend.md](backend.md), [controllers.md](controllers.md), [api-contract.md](api-contract.md)

## Registration Chain

Backend route registration flows through:

1. [server/appFactory.js](../server/appFactory.js)
2. [server/appFactory/registerFeatures/index.js](../server/appFactory/registerFeatures/index.js)
3. [server/core/bootstrap/features.js](../server/core/bootstrap/features.js)
4. `server/features/*/register*Feature.js`
5. `server/features/**/routes/**/*.js`

## Route Ownership Pattern

- Route modules own the HTTP contract.
- When a handler grows, extract helper files beside the route module or into the owning feature service tree.
- Representative helper trees:
  - `server/features/commerce/routes/purchaseOrders/listCreate/*`
  - `server/features/commerce/routes/purchaseOrders/edit/*`
  - `server/features/communication/routes/messageToCustomer/*`
  - `server/features/credits/routes/creditIssues/admin/*`

## Method And Path Conventions

- Collections: `GET /api/<resource>`, `POST /api/<resource>`
- Items: `GET|PUT|DELETE /api/<resource>/:id`
- Action endpoints: `POST` or `PATCH` on a resource-specific suffix, for example:
  - `POST /api/orders/create-validated`
  - `POST /api/categories/:id/move`
  - `PATCH /api/products/:id/category`
- Internal jobs use `/api/internal/*`.
- Admin-only resources use `/api/admin/*`.

## Exceptions

- Compatibility aliases and disabled endpoints are documented in [../ROUTES.md](../ROUTES.md) and must not be silently removed.
- Conditional profile-image redirect routes are mounted by [server/core/httpSetup.js](../server/core/httpSetup.js) only when `profileImagePublicBaseUrl` is configured.
- Frontend page routes are separate and live in [../src/app/appRoutes.jsx](../src/app/appRoutes.jsx).
