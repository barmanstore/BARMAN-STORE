# Naming Conventions

See also: [routing.md](routing.md), [controllers.md](controllers.md), [patterns.md](patterns.md)

## Backend

- Route registrar exports use `register*Routes`, for example `registerOrderCreateRoutes`.
- Aggregator files use `*Routes.js`.
- Feature helper folders are named after the route concern, for example `purchaseOrders`, `creditIssues`, `messageToCustomer`.
- URL slices and file names generally align, for example:
  - `purchaseOrders*` -> `/api/purchase-orders/*`
  - `category*` -> `/api/categories/*`
  - `userNotification*` -> `/api/notifications/*`

## Frontend

- Page orchestration hooks use `use*Controller`.
- Focused helper hooks use `use*` plus the domain action, for example `useAdminDataLoaders` or `useProductsTelemetry`.
- API clients use `*Api`.

## Data And Schema

- Migration files use `YYYYMMDDHHMMSS_description.sql`.
- Constant names are uppercase, while stored status values are normalized lowercase strings such as `prepared`, `confirmed`, `part_paid`, or `corrected`.

## Constraint

- Do not force `user.routes.js -> user.controller.js` naming into this repo. That is not the current backend model.
