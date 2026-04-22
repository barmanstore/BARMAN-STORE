# Services

See also: [backend.md](backend.md), [frontend.md](frontend.md), [api-contract.md](api-contract.md), [patterns.md](patterns.md)

## Backend Services

- Domain services are composed in [server/appFactory/createDomainServices.js](../server/appFactory/createDomainServices.js).
- The main service groups are:
  - `server/appFactory/domainServices/core`
  - `server/appFactory/domainServices/notifications`
  - `server/appFactory/domainServices/phoneChange`
  - `server/appFactory/domainServices/purchaseOperations`
  - `server/appFactory/domainServices/retention`
  - `server/appFactory/domainServices/auth`
- Some feature services also live under `server/services`, for example [server/services/purchaseOperations/summary.js](../server/services/purchaseOperations/summary.js).

## Frontend Services

- API wrappers live in `src/shared/services/api/*.js`.
- All wrappers are built on [src/shared/services/api/core.js](../src/shared/services/api/core.js).
- Cart state is intentionally local in the frontend; there is no live backend cart service wrapper.
- Representative clients:
  - [src/shared/services/api/orders.js](../src/shared/services/api/orders.js)
  - [src/shared/services/api/purchaseOrders.js](../src/shared/services/api/purchaseOrders.js)
  - [src/shared/services/api/notifications.js](../src/shared/services/api/notifications.js)

## Rules

- Service layers should hide transport details, not own page rendering.
- When an API contract changes, update the wrapper and [../ROUTES.md](../ROUTES.md) together.
- Do not treat unused or stale frontend wrappers as proof that a backend route exists.
- Remove dead wrapper methods when [../ROUTES.md](../ROUTES.md) has no matching endpoint instead of leaving undocumented transport assumptions in the client.
