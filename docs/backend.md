# Backend

See also: [../ARCHITECTURE.md](../ARCHITECTURE.md), [../ROUTES.md](../ROUTES.md), [routing.md](routing.md), [controllers.md](controllers.md), [services.md](services.md)

## Real Structure

- App assembly starts in [server/appFactory.js](../server/appFactory.js).
- Core app, providers, database, auth support, and bootstrap config are built in [server/appFactory/createCore.js](../server/appFactory/createCore.js).
- Domain services are built in [server/appFactory/createDomainServices.js](../server/appFactory/createDomainServices.js).
- Feature registration happens through [server/appFactory/registerFeatures/index.js](../server/appFactory/registerFeatures/index.js) and [server/core/bootstrap/features.js](../server/core/bootstrap/features.js).
- Route files live under `server/features/**/routes/**`.

## Important Constraints

- [server/index.js](../server/index.js) is a runtime entrypoint, not a place for ad hoc route imports.
- There is no backend `server/controllers/` tree. Keep orchestration in route modules or same-feature helpers.
- Shared helpers belong in `server/utils`, `server/services`, or `server/appFactory/domainServices` only when they are truly cross-feature.
- The in-memory limiter in [server/core/rateLimiter.js](../server/core/rateLimiter.js) is process-local. It is suitable for single-instance runtime and local development only. Use a shared backing store if multi-instance enforcement is required.
- [server/whatsappProvider.js](../server/whatsappProvider.js) is currently a manual-prepared-message capability boundary, not a live send integration. Keep status endpoints, purchase flows, and verification helpers honest about manual scope until a real provider-backed sender is implemented.
- Purchase planning remains a shared-summary backend surface. Keep supplier-day visit persistence inside the existing purchase-operations and purchase-order feature routes, and let [server/services/purchaseOperations/summary.js](../server/services/purchaseOperations/summary.js) stay the source of truth for board state instead of introducing dashboard-only workflow storage.

## Change Rules

- Add backend behavior inside the existing feature subtree first.
- Keep JSON responses and explicit status codes.
- Update [../ROUTES.md](../ROUTES.md) whenever a backend route changes.
- If a change affects business rules or validation, update [business-logic.md](business-logic.md) or [validation.md](validation.md) in the same task.
